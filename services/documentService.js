// services/documentService.js - Servicio de Azure Search con embeddings vectoriales

const { SearchClient, AzureKeyCredential } = require('@azure/search-documents');
const OpenAI = require('openai');
require('dotenv').config();

/**
 * Servicio para búsqueda de documentos usando Azure Search con embeddings vectoriales
 */
class DocumentService {
    constructor() {
        // Prevenir múltiples instancias
        if (DocumentService.instance) {
            return DocumentService.instance;
        }
        
        this.searchAvailable = false;
        this.openaiAvailable = false;
        this.initializationError = null;
        
        console.log('🔍 Inicializando Document Service...');
        this.initializeOpenAI();
        this.initializeAzureSearch();
        
        // Guardar instancia singleton
        DocumentService.instance = this;
        
        console.log(`✅ Document Service inicializado - Search: ${this.searchAvailable}, OpenAI: ${this.openaiAvailable}`);
    }

    /**
     * Inicializa el cliente de OpenAI para embeddings
     */
    initializeOpenAI() {
        try {
            const apiKey = process.env.OPENAI_API_KEY;
            
            if (!apiKey) {
                console.warn('⚠️ OpenAI no configurado para embeddings en DocumentService');
                this.openaiAvailable = false;
                return;
            }
            
            this.openai = new OpenAI({ 
                apiKey,
                timeout: 30000 // 30 segundos para embeddings
            });
            this.openaiAvailable = true;
            console.log('✅ OpenAI configurado para embeddings en DocumentService');
            
        } catch (error) {
            console.error('❌ Error inicializando OpenAI para DocumentService:', error);
            this.openaiAvailable = false;
            this.initializationError = error.message;
        }
    }

    /**
     * Inicializa el cliente de Azure Search
     */
    initializeAzureSearch() {
        try {
            const endpoint = process.env.AZURE_SEARCH_ENDPOINT || process.env.SERVICE_ENDPOINT;
            const apiKey = process.env.AZURE_SEARCH_API_KEY || process.env.API_KEY;
            const indexName = process.env.AZURE_SEARCH_INDEX_NAME || process.env.INDEX_NAME || 'alfa_bot';

            console.log('🔍 Configuración Azure Search:', {
                endpoint: endpoint ? '✅ Configurado' : '❌ Faltante',
                apiKey: apiKey ? '✅ Configurado' : '❌ Faltante',
                indexName: indexName
            });

            if (!endpoint || !apiKey) {
                console.warn('⚠️ Azure Search no configurado - Variables faltantes');
                console.warn('   Requeridas: AZURE_SEARCH_ENDPOINT, AZURE_SEARCH_API_KEY');
                console.warn('   Alternativas: SERVICE_ENDPOINT, API_KEY');
                this.searchAvailable = false;
                this.initializationError = 'Variables de Azure Search faltantes';
                return;
            }

            this.searchClient = new SearchClient(
                endpoint,
                indexName,
                new AzureKeyCredential(apiKey)
            );
            
            this.indexName = indexName;
            this.searchAvailable = true;
            console.log(`✅ Azure Search configurado correctamente`);
            console.log(`   Endpoint: ${endpoint}`);
            console.log(`   Index: ${indexName}`);
            
            // Test básico de conectividad
            this.testSearchConnection();
            
        } catch (error) {
            console.error('❌ Error inicializando Azure Search:', error);
            this.searchAvailable = false;
            this.initializationError = error.message;
        }
    }

    /**
     * Test de conectividad con Azure Search
     */
    async testSearchConnection() {
        try {
            console.log('🧪 Probando conectividad con Azure Search...');
            
            // Realizar una búsqueda simple de prueba
            const testResults = await this.searchClient.search('*', { 
                top: 1,
                select: ['*']
            });
            
            console.log('✅ Test de conectividad Azure Search exitoso');
            
        } catch (error) {
            console.warn('⚠️ Test de conectividad Azure Search falló:', error.message);
            if (error.statusCode === 403) {
                console.warn('   Posible problema de permisos en la API Key');
            } else if (error.statusCode === 404) {
                console.warn('   Posible problema con el endpoint o nombre del índice');
            }
        }
    }

    /**
     * Busca documentos en el índice de Azure Search
     */
    async buscarDocumentos(consulta, userId = 'unknown') {
        if (!this.searchAvailable) {
            return `⚠️ **Servicio de búsqueda no disponible**\n\n${this.initializationError || 'Azure Search no configurado'}`;
        }

        try {
            console.log(`🔍 [${userId}] Buscando documentos: "${consulta}"`);

            let vectorQuery = null;
            
            // Intentar crear embedding si OpenAI está disponible
            if (this.openaiAvailable) {
                try {
                    console.log(`🧠 [${userId}] Creando embedding para búsqueda vectorial...`);
                    
                    const embedding = await this.openai.embeddings.create({
                        model: 'text-embedding-3-large',
                        input: consulta,
                        dimensions: 1024
                    });
                    
                    console.log(`✅ [${userId}] Embedding creado con ${embedding.data[0].embedding.length} dimensiones`);
                    
                    vectorQuery = {
                        vector: embedding.data[0].embedding,
                        kNearestNeighbors: 10,
                        fields: 'Embedding'
                    };
                } catch (embError) {
                    console.warn(`⚠️ [${userId}] No se pudo crear embedding:`, embError.message);
                }
            }
            
            // Configurar opciones de búsqueda
            const searchOptions = {
                select: ['Chunk', 'FileName', 'Adicional'],
                top: 15,
                searchMode: 'any',
                queryType: 'full'
            };
            
            // Agregar vector query si está disponible
            if (vectorQuery) {
                searchOptions.vectorQueries = [vectorQuery];
                console.log(`🎯 [${userId}] Usando búsqueda vectorial + texto`);
            } else {
                console.log(`📝 [${userId}] Usando solo búsqueda de texto`);
            }
            
            const searchResults = await this.searchClient.search(consulta, searchOptions);

            console.log(`🔍 [${userId}] Procesando resultados...`);
            const resultados = [];
            const documentosProcesados = new Set();
            
            for await (const result of searchResults.results) {
                const doc = result.document;
                const score = result.score || 0;
                
                console.log(`📄 [${userId}] Encontrado: ${doc.FileName} (score: ${score.toFixed(3)})`);
                
                // Limitar chunk a 300 caracteres para legibilidad
                const chunk = doc.Chunk?.substring(0, 300) + (doc.Chunk?.length > 300 ? '...' : '');
                
                // Crear clave única para evitar duplicados
                const documentKey = `${doc.FileName}-${doc.Chunk?.substring(0, 50)}`;
                
                if (!documentosProcesados.has(documentKey)) {
                    documentosProcesados.add(documentKey);
                    resultados.push({
                        fileName: doc.FileName,
                        chunk: chunk,
                        score: score,
                        adicional: doc.Adicional
                    });
                }
                
                if (resultados.length >= 7) break;
            }
            
            // Si no tenemos suficientes resultados, intentar búsqueda más amplia
            if (resultados.length < 7) {
                console.log(`⚠️ [${userId}] Solo ${resultados.length} resultados, intentando búsqueda amplia...`);
                
                const palabrasConsulta = consulta.split(' ');
                if (palabrasConsulta.length > 1) {
                    const consultaAmplia = palabrasConsulta[0];
                    console.log(`🔍 [${userId}] Búsqueda amplia: "${consultaAmplia}"`);
                    
                    const searchResultsAmplia = await this.searchClient.search(consultaAmplia, {
                        select: ['Chunk', 'FileName', 'Adicional'],
                        top: 10,
                        searchMode: 'any'
                    });
                    
                    for await (const result of searchResultsAmplia.results) {
                        const doc = result.document;
                        const chunk = doc.Chunk?.substring(0, 300) + (doc.Chunk?.length > 300 ? '...' : '');
                        const documentKey = `${doc.FileName}-${doc.Chunk?.substring(0, 50)}`;
                        
                        if (!documentosProcesados.has(documentKey)) {
                            documentosProcesados.add(documentKey);
                            resultados.push({
                                fileName: doc.FileName,
                                chunk: chunk,
                                score: result.score || 0,
                                adicional: doc.Adicional
                            });
                            console.log(`📄 [${userId}] Agregado desde búsqueda amplia: ${doc.FileName}`);
                        }
                        
                        if (resultados.length >= 7) break;
                    }
                }
            }
            
            console.log(`📊 [${userId}] Total resultados encontrados: ${resultados.length}`);
            
            return this.formatearResultados(resultados, consulta, userId);
                
        } catch (error) {
            console.error(`❌ [${userId}] Error en búsqueda de documentos:`, error);
            return `❌ **Error en búsqueda de documentos**: ${error.message}`;
        }
    }

    /**
     * Formatea los resultados de búsqueda
     */
    formatearResultados(resultados, consulta, userId) {
        if (resultados.length === 0) {
            return `🔍 **Búsqueda: "${consulta}"**\n\n` +
                   `❌ No se encontraron documentos relevantes.\n\n` +
                   `💡 **Sugerencias:**\n` +
                   `• Intenta con términos más generales\n` +
                   `• Verifica la ortografía\n` +
                   `• Usa sinónimos o palabras relacionadas`;
        }

        let respuesta = `🔍 **Búsqueda: "${consulta}"**\n\n`;
        respuesta += `📚 **Documentos encontrados (${resultados.length}):**\n\n`;

        resultados.forEach((resultado, index) => {
            respuesta += `**${index + 1}. ${resultado.fileName}** `;
            
            if (resultado.score > 0) {
                respuesta += `(Relevancia: ${(resultado.score * 100).toFixed(1)}%)\n`;
            } else {
                respuesta += '\n';
            }
            
            respuesta += `${resultado.chunk}\n`;
            
            if (resultado.adicional) {
                respuesta += `📌 *${resultado.adicional}*\n`;
            }
            
            if (index < resultados.length - 1) {
                respuesta += '\n---\n\n';
            }
        });

        respuesta += `\n\n💡 **¿Necesitas más información sobre algún documento específico?**`;
        
        return respuesta;
    }

    /**
     * Busca políticas específicas
     */
    async buscarPoliticas(tipoPolitica, userId = 'unknown') {
        console.log(`📋 [${userId}] Buscando políticas: ${tipoPolitica}`);
        
        // Términos de búsqueda optimizados para políticas comunes
        const politicasComunes = {
            'vacaciones': 'política vacaciones días festivos permisos ausencias',
            'codigo vestimenta': 'código vestimenta dress code uniforme ropa',
            'horario': 'horario trabajo jornada laboral entrada salida',
            'home office': 'home office trabajo remoto teletrabajo casa',
            'prestaciones': 'prestaciones beneficios compensaciones aguinaldo prima',
            'codigo conducta': 'código conducta ética comportamiento valores',
            'seguridad': 'seguridad higiene protección personal accidentes',
            'capacitacion': 'capacitación entrenamiento desarrollo cursos',
            'nomina': 'nómina salarios pagos descuentos percepciones',
            'rh': 'recursos humanos personal contratación despido',
            'confidencialidad': 'confidencialidad información privada datos sensibles'
        };

        const terminos = politicasComunes[tipoPolitica.toLowerCase()] || tipoPolitica;
        console.log(`🎯 [${userId}] Términos de búsqueda: "${terminos}"`);
        
        return await this.buscarDocumentos(terminos, userId);
    }

    /**
     * Obtiene información sobre días feriados
     */
    async obtenerDiasFeriados(año, userId = 'unknown') {
        const añoActual = año || new Date().getFullYear();
        console.log(`📅 [${userId}] Buscando días feriados para ${añoActual}`);
        
        const consulta = `días feriados festivos ${añoActual} calendario oficial`;
        
        const resultado = await this.buscarDocumentos(consulta, userId);
        
        // Si no se encuentran resultados específicos del año, buscar política general
        if (resultado.includes("No se encontraron documentos")) {
            console.log(`🔄 [${userId}] No se encontraron feriados específicos, buscando política general`);
            return await this.buscarDocumentos("días feriados festivos oficiales política", userId);
        }
        
        return resultado;
    }

    /**
     * Extrae contenido relevante del documento
     */
    extraerContenidoRelevante(contenido, consulta, highlights) {
        if (!contenido) return "Contenido no disponible";

        // Si hay highlights, usarlos
        if (highlights && highlights.length > 0) {
            return highlights.join(" ... ");
        }

        // Si no hay highlights, extraer contexto alrededor de las palabras clave
        const palabrasClave = consulta.toLowerCase().split(' ').filter(p => p.length > 2);
        const lineas = contenido.split('\n');
        let lineasRelevantes = [];

        for (const linea of lineas) {
            const lineaLower = linea.toLowerCase();
            if (palabrasClave.some(palabra => lineaLower.includes(palabra))) {
                lineasRelevantes.push(linea.trim());
            }
        }

        if (lineasRelevantes.length > 0) {
            return lineasRelevantes.slice(0, 3).join('\n');
        }

        // Si no se encuentra contexto específico, devolver las primeras líneas
        return lineas.slice(0, 3).join('\n').substring(0, 500) + '...';
    }

    /**
     * Búsqueda general de documentos (wrapper principal)
     */
    async buscarDocumentosGenerales(consulta, userId = 'unknown') {
        console.log(`📖 [${userId}] Búsqueda general de documentos: "${consulta}"`);
        
        // Detectar si es una consulta específica
        const consultaLower = consulta.toLowerCase();
        
        if (consultaLower.includes('política') || consultaLower.includes('politica')) {
            // Extraer tipo de política
            const tiposPolitica = ['vacaciones', 'horario', 'vestimenta', 'conducta', 'seguridad', 'prestaciones'];
            const tipoPolitica = tiposPolitica.find(tipo => consultaLower.includes(tipo));
            
            if (tipoPolitica) {
                console.log(`🎯 [${userId}] Detectada consulta de política: ${tipoPolitica}`);
                return await this.buscarPoliticas(tipoPolitica, userId);
            }
        }
        
        if (consultaLower.includes('feriado') || consultaLower.includes('festivo')) {
            // Extraer año si está presente
            const añoMatch = consulta.match(/\b(20\d{2})\b/);
            const año = añoMatch ? parseInt(añoMatch[1]) : new Date().getFullYear();
            
            console.log(`📅 [${userId}] Detectada consulta de feriados para ${año}`);
            return await this.obtenerDiasFeriados(año, userId);
        }
        
        // Búsqueda general
        return await this.buscarDocumentos(consulta, userId);
    }

    /**
     * Verifica si el servicio está disponible
     */
    isAvailable() {
        return this.searchAvailable;
    }

    /**
     * Obtiene información de configuración
     */
    getConfigInfo() {
        return {
            searchAvailable: this.searchAvailable,
            openaiAvailable: this.openaiAvailable,
            indexName: this.indexName || 'No configurado',
            error: this.initializationError,
            features: {
                vectorSearch: this.searchAvailable && this.openaiAvailable,
                textSearch: this.searchAvailable,
                policySearch: this.searchAvailable,
                holidaySearch: this.searchAvailable
            }
        };
    }

    /**
     * Obtiene estadísticas del servicio
     */
    async getStats() {
        try {
            if (!this.searchAvailable) {
                return {
                    available: false,
                    error: this.initializationError
                };
            }

            // Estadísticas básicas
            const stats = {
                available: true,
                searchAvailable: this.searchAvailable,
                openaiAvailable: this.openaiAvailable,
                indexName: this.indexName,
                features: this.getConfigInfo().features,
                timestamp: new Date().toISOString()
            };

            return stats;

        } catch (error) {
            console.error('❌ Error obteniendo estadísticas DocumentService:', error);
            return {
                available: false,
                error: error.message
            };
        }
    }
}

// Crear instancia singleton
const documentService = new DocumentService();

module.exports = documentService;