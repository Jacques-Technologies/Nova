// services/seguimientoService.js - Sistema de seguimiento con 5 mensajes de referencia

const { DateTime } = require('luxon');
const cosmosService = require('./cosmosService');

/**
 * Servicio de Seguimiento - Mantiene historial de 5 mensajes de referencia más recientes
 */
class SeguimientoService {
    constructor() {
        // Cache en memoria para acceso rápido
        this.referenciaCache = new Map(); // userId -> [mensajes de referencia]
        this.initialized = false;
        
        console.log('📋 Inicializando SeguimientoService...');
        this.init();
    }

    async init() {
        try {
            this.cosmosAvailable = cosmosService.isAvailable();
            this.initialized = true;
            
            console.log(`✅ SeguimientoService inicializado - Cosmos DB: ${this.cosmosAvailable ? 'Disponible' : 'Solo memoria'}`);
            
            // Cargar datos existentes si hay Cosmos DB
            if (this.cosmosAvailable) {
                await this.cargarDatosExistentes();
            }
            
        } catch (error) {
            console.error('❌ Error inicializando SeguimientoService:', error);
            this.initialized = false;
        }
    }

    /**
     * Carga datos existentes desde Cosmos DB al cache
     */
    async cargarDatosExistentes() {
        try {
            console.log('📂 Cargando mensajes de referencia existentes desde Cosmos DB...');
            
            // Query para obtener mensajes de referencia de todos los usuarios
            const query = {
                query: `
                    SELECT * FROM c 
                    WHERE c.documentType = 'mensaje_referencia'
                    ORDER BY c.timestamp DESC
                `
            };

            const { resources: mensajes } = await cosmosService.container.items
                .query(query)
                .fetchAll();

            // Agrupar por usuario y mantener solo los 5 más recientes
            const mensajesPorUsuario = new Map();
            
            mensajes.forEach(msg => {
                const userId = msg.userId;
                if (!mensajesPorUsuario.has(userId)) {
                    mensajesPorUsuario.set(userId, []);
                }
                mensajesPorUsuario.get(userId).push(msg);
            });

            // Cargar al cache manteniendo solo 5 por usuario
            for (const [userId, userMessages] of mensajesPorUsuario.entries()) {
                const ultimosCinco = userMessages
                    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
                    .slice(0, 5);
                
                this.referenciaCache.set(userId, ultimosCinco);
                console.log(`📋 Cargados ${ultimosCinco.length} mensajes de referencia para usuario ${userId}`);
            }

            console.log(`✅ Datos existentes cargados: ${mensajesPorUsuario.size} usuarios`);
            
        } catch (error) {
            console.warn('⚠️ Error cargando datos existentes:', error.message);
        }
    }

    /**
     * Agrega un nuevo mensaje de referencia
     * @param {string} userId - ID del usuario
     * @param {string} contenido - Contenido del mensaje de referencia
     * @param {string} tipo - Tipo de mensaje (analysis, recommendation, status, etc.)
     * @param {Object} metadata - Metadatos adicionales
     * @returns {Object} Mensaje de referencia creado
     */
    async agregarMensajeReferencia(userId, contenido, tipo = 'general', metadata = {}) {
        try {
            if (!this.initialized) {
                console.warn('⚠️ SeguimientoService no inicializado');
                return null;
            }

            const timestamp = DateTime.now().setZone('America/Mexico_City').toISO();
            const mensajeId = this.generarId();

            const mensajeReferencia = {
                id: mensajeId,
                userId: userId,
                documentType: 'mensaje_referencia',
                contenido: contenido,
                tipo: tipo,
                timestamp: timestamp,
                numeroReferencia: this.obtenerSiguienteNumero(userId),
                metadata: {
                    ...metadata,
                    version: '2.1.0',
                    source: 'nova_bot'
                },
                ttl: 60 * 60 * 24 * 30, // TTL: 30 días
                partitionKey: userId
            };

            // Agregar al cache
            let mensajesUsuario = this.referenciaCache.get(userId) || [];
            mensajesUsuario.unshift(mensajeReferencia); // Agregar al inicio

            // Mantener solo los últimos 5
            if (mensajesUsuario.length > 5) {
                const eliminado = mensajesUsuario.pop();
                console.log(`🗑️ [${userId}] Eliminando mensaje de referencia más antiguo: ${eliminado.numeroReferencia}`);
                
                // Eliminar de Cosmos DB también
                if (this.cosmosAvailable) {
                    try {
                        await cosmosService.container.item(eliminado.id, userId).delete();
                    } catch (error) {
                        console.warn(`⚠️ Error eliminando mensaje antiguo de Cosmos DB:`, error.message);
                    }
                }
            }

            this.referenciaCache.set(userId, mensajesUsuario);

            // Guardar en Cosmos DB si está disponible
            if (this.cosmosAvailable) {
                try {
                    await cosmosService.container.items.create(mensajeReferencia);
                    console.log(`💾 [${userId}] Mensaje de referencia guardado en Cosmos DB: #${mensajeReferencia.numeroReferencia}`);
                } catch (error) {
                    console.error(`❌ Error guardando en Cosmos DB:`, error.message);
                }
            }

            console.log(`📋 [${userId}] Nuevo mensaje de referencia agregado: #${mensajeReferencia.numeroReferencia} (${tipo})`);
            return mensajeReferencia;

        } catch (error) {
            console.error('❌ Error agregando mensaje de referencia:', error);
            return null;
        }
    }

    /**
     * Obtiene los mensajes de referencia de un usuario
     * @param {string} userId - ID del usuario
     * @returns {Array} Array de mensajes de referencia (máximo 5)
     */
    async obtenerMensajesReferencia(userId) {
        try {
            if (!this.initialized) {
                return [];
            }

            // Intentar desde cache primero
            let mensajes = this.referenciaCache.get(userId) || [];

            // Si no hay cache y Cosmos DB está disponible, cargar desde DB
            if (mensajes.length === 0 && this.cosmosAvailable) {
                try {
                    const query = {
                        query: `
                            SELECT * FROM c 
                            WHERE c.userId = @userId 
                            AND c.documentType = 'mensaje_referencia'
                            ORDER BY c.timestamp DESC
                        `,
                        parameters: [{ name: '@userId', value: userId }]
                    };

                    const { resources: dbMensajes } = await cosmosService.container.items
                        .query(query, { partitionKey: userId })
                        .fetchAll();

                    mensajes = dbMensajes.slice(0, 5);
                    this.referenciaCache.set(userId, mensajes);

                    console.log(`📂 [${userId}] Mensajes de referencia cargados desde Cosmos DB: ${mensajes.length}`);

                } catch (error) {
                    console.warn(`⚠️ Error cargando desde Cosmos DB:`, error.message);
                }
            }

            return mensajes.sort((a, b) => b.numeroReferencia - a.numeroReferencia);

        } catch (error) {
            console.error('❌ Error obteniendo mensajes de referencia:', error);
            return [];
        }
    }

    /**
     * Obtiene un mensaje de referencia específico por número
     * @param {string} userId - ID del usuario
     * @param {number} numeroReferencia - Número del mensaje de referencia
     * @returns {Object|null} Mensaje de referencia o null si no existe
     */
    async obtenerMensajePorNumero(userId, numeroReferencia) {
        try {
            const mensajes = await this.obtenerMensajesReferencia(userId);
            return mensajes.find(msg => msg.numeroReferencia === numeroReferencia) || null;
        } catch (error) {
            console.error('❌ Error obteniendo mensaje por número:', error);
            return null;
        }
    }

    /**
     * Formatea los mensajes de referencia para mostrar al usuario
     * @param {string} userId - ID del usuario
     * @param {boolean} incluirContenido - Si incluir el contenido completo
     * @returns {string} Mensajes formateados
     */
    async formatearMensajesReferencia(userId, incluirContenido = false) {
        try {
            const mensajes = await this.obtenerMensajesReferencia(userId);

            if (mensajes.length === 0) {
                return `📋 **Historial de Seguimiento**\n\n` +
                       `❌ **No hay mensajes de referencia**\n\n` +
                       `Los mensajes de referencia se crean automáticamente cuando:\n` +
                       `• Realizas consultas importantes\n` +
                       `• Obtienes análisis detallados\n` +
                       `• El sistema genera recomendaciones\n\n` +
                       `💡 **Consejo**: Usa comandos como \`tasas 2025\` o \`buscar políticas\` para generar referencias.`;
            }

            let respuesta = `📋 **Historial de Seguimiento - Últimos ${mensajes.length} mensajes de referencia**\n\n`;

            mensajes.forEach((msg, index) => {
                const fecha = DateTime.fromISO(msg.timestamp).toFormat('dd/MM/yyyy HH:mm');
                const tipoEmoji = this.obtenerEmojiTipo(msg.tipo);

                respuesta += `${tipoEmoji} **Referencia #${msg.numeroReferencia}** - ${msg.tipo}\n`;
                respuesta += `📅 ${fecha}\n`;

                if (incluirContenido) {
                    const preview = msg.contenido.length > 200 ? 
                        msg.contenido.substring(0, 200) + '...' : 
                        msg.contenido;
                    respuesta += `📝 ${preview}\n`;
                } else {
                    respuesta += `📝 ${msg.contenido.substring(0, 80)}${msg.contenido.length > 80 ? '...' : ''}\n`;
                }

                if (msg.metadata && Object.keys(msg.metadata).length > 0) {
                    const metaInfo = Object.entries(msg.metadata)
                        .filter(([key]) => !['version', 'source'].includes(key))
                        .map(([key, value]) => `${key}: ${value}`)
                        .join(', ');
                    
                    if (metaInfo) {
                        respuesta += `🔍 ${metaInfo}\n`;
                    }
                }

                if (index < mensajes.length - 1) {
                    respuesta += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
                }
            });

            respuesta += `\n\n💡 **Comandos de seguimiento:**\n`;
            respuesta += `• \`historial detallado\` - Ver contenido completo\n`;
            respuesta += `• \`referencia #N\` - Ver mensaje específico\n`;
            respuesta += `• \`limpiar seguimiento\` - Eliminar historial\n`;
            respuesta += `• \`exportar seguimiento\` - Obtener resumen completo`;

            return respuesta;

        } catch (error) {
            console.error('❌ Error formateando mensajes de referencia:', error);
            return '❌ Error generando historial de seguimiento';
        }
    }

    /**
     * Obtiene estadísticas del seguimiento
     * @param {string} userId - ID del usuario
     * @returns {Object} Estadísticas del seguimiento
     */
    async obtenerEstadisticas(userId) {
        try {
            const mensajes = await this.obtenerMensajesReferencia(userId);

            const estadisticas = {
                totalMensajes: mensajes.length,
                tiposMensajes: {},
                rangoFechas: null,
                mensajeMasReciente: null,
                mensajeMasAntiguo: null
            };

            if (mensajes.length > 0) {
                // Contar tipos
                mensajes.forEach(msg => {
                    estadisticas.tiposMensajes[msg.tipo] = (estadisticas.tiposMensajes[msg.tipo] || 0) + 1;
                });

                // Fechas
                const fechas = mensajes.map(msg => DateTime.fromISO(msg.timestamp));
                estadisticas.mensajeMasReciente = fechas[0].toFormat('dd/MM/yyyy HH:mm');
                estadisticas.mensajeMasAntiguo = fechas[fechas.length - 1].toFormat('dd/MM/yyyy HH:mm');

                const rangoHoras = fechas[0].diff(fechas[fechas.length - 1], 'hours').hours;
                estadisticas.rangoFechas = `${Math.round(rangoHoras)} horas`;
            }

            return estadisticas;

        } catch (error) {
            console.error('❌ Error obteniendo estadísticas:', error);
            return null;
        }
    }

    /**
     * Limpia el historial de seguimiento de un usuario
     * @param {string} userId - ID del usuario
     * @returns {boolean} True si se limpió correctamente
     */
    async limpiarSeguimiento(userId) {
        try {
            const mensajes = await this.obtenerMensajesReferencia(userId);
            
            if (mensajes.length === 0) {
                return true; // Ya está limpio
            }

            // Limpiar cache
            this.referenciaCache.delete(userId);

            // Limpiar Cosmos DB
            if (this.cosmosAvailable) {
                let eliminados = 0;
                for (const mensaje of mensajes) {
                    try {
                        await cosmosService.container.item(mensaje.id, userId).delete();
                        eliminados++;
                    } catch (error) {
                        console.warn(`⚠️ Error eliminando mensaje ${mensaje.id}:`, error.message);
                    }
                }
                console.log(`🗑️ [${userId}] Eliminados ${eliminados} mensajes de referencia de Cosmos DB`);
            }

            console.log(`✅ [${userId}] Seguimiento limpiado completamente`);
            return true;

        } catch (error) {
            console.error('❌ Error limpiando seguimiento:', error);
            return false;
        }
    }

    /**
     * Exporta el seguimiento completo como texto
     * @param {string} userId - ID del usuario
     * @param {Object} userInfo - Información del usuario
     * @returns {string} Seguimiento exportado
     */
    async exportarSeguimiento(userId, userInfo) {
        try {
            const mensajes = await this.obtenerMensajesReferencia(userId);
            const estadisticas = await this.obtenerEstadisticas(userId);

            if (mensajes.length === 0) {
                return '📋 **Exportación de Seguimiento**\n\nNo hay mensajes de referencia para exportar.';
            }

            const fechaExportacion = DateTime.now().setZone('America/Mexico_City').toFormat('dd/MM/yyyy HH:mm:ss');

            let exportacion = `📋 **NOVA BOT - EXPORTACIÓN DE SEGUIMIENTO**\n`;
            exportacion += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
            exportacion += `👤 **Usuario**: ${userInfo?.nombre || 'Desconocido'} (${userId})\n`;
            exportacion += `📅 **Fecha de Exportación**: ${fechaExportacion}\n`;
            exportacion += `📊 **Total de Referencias**: ${estadisticas.totalMensajes}\n`;
            exportacion += `🕐 **Rango**: ${estadisticas.rangoFechas || 'N/A'}\n\n`;

            exportacion += `📈 **Estadísticas por Tipo:**\n`;
            Object.entries(estadisticas.tiposMensajes).forEach(([tipo, cantidad]) => {
                const emoji = this.obtenerEmojiTipo(tipo);
                exportacion += `   ${emoji} ${tipo}: ${cantidad}\n`;
            });

            exportacion += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
            exportacion += `📝 **HISTORIAL COMPLETO:**\n\n`;

            mensajes.forEach((msg, index) => {
                const fecha = DateTime.fromISO(msg.timestamp).toFormat('dd/MM/yyyy HH:mm:ss');
                const tipoEmoji = this.obtenerEmojiTipo(msg.tipo);

                exportacion += `${index + 1}. ${tipoEmoji} **REFERENCIA #${msg.numeroReferencia}**\n`;
                exportacion += `   📅 Fecha: ${fecha}\n`;
                exportacion += `   🏷️ Tipo: ${msg.tipo}\n`;
                exportacion += `   📝 Contenido:\n`;
                exportacion += `   ${msg.contenido.replace(/\n/g, '\n   ')}\n`;

                if (msg.metadata && Object.keys(msg.metadata).length > 0) {
                    exportacion += `   🔍 Metadata: ${JSON.stringify(msg.metadata, null, 6).replace(/\n/g, '\n   ')}\n`;
                }

                exportacion += `\n`;
            });

            exportacion += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
            exportacion += `📋 **Fin de Exportación** - Nova Bot v2.1.0`;

            return exportacion;

        } catch (error) {
            console.error('❌ Error exportando seguimiento:', error);
            return '❌ Error generando exportación de seguimiento';
        }
    }

    /**
     * Obtiene el siguiente número de referencia para un usuario
     * @param {string} userId - ID del usuario
     * @returns {number} Siguiente número de referencia
     */
    obtenerSiguienteNumero(userId) {
        const mensajes = this.referenciaCache.get(userId) || [];
        if (mensajes.length === 0) {
            return 1;
        }
        const ultimoNumero = Math.max(...mensajes.map(m => m.numeroReferencia));
        return ultimoNumero + 1;
    }

    /**
     * Genera un ID único para el mensaje
     * @returns {string} ID único
     */
    generarId() {
        return `ref_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Obtiene emoji según el tipo de mensaje
     * @param {string} tipo - Tipo de mensaje
     * @returns {string} Emoji correspondiente
     */
    obtenerEmojiTipo(tipo) {
        const emojis = {
            'general': '📋',
            'analysis': '📊',
            'recommendation': '💡',
            'status': '🔍',
            'error': '❌',
            'success': '✅',
            'tasas': '💰',
            'documentos': '📖',
            'politicas': '📑',
            'feriados': '📅',
            'consulta': '🔍',
            'sistema': '⚙️'
        };
        return emojis[tipo] || '📋';
    }

    /**
     * Verifica si el servicio está disponible
     * @returns {boolean} True si está disponible
     */
    isAvailable() {
        return this.initialized;
    }

    /**
     * Obtiene estadísticas generales del servicio
     * @returns {Object} Estadísticas generales
     */
    obtenerEstadisticasGenerales() {
        return {
            initialized: this.initialized,
            cosmosAvailable: this.cosmosAvailable,
            usuariosEnCache: this.referenciaCache.size,
            totalMensajesEnCache: Array.from(this.referenciaCache.values()).reduce((total, msgs) => total + msgs.length, 0),
            timestamp: DateTime.now().setZone('America/Mexico_City').toISO()
        };
    }
}

// Crear instancia singleton
const seguimientoService = new SeguimientoService();

module.exports = seguimientoService;