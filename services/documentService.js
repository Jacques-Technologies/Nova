// services/documentService.js - Servicio de Azure Search con embeddings vectoriales (Azure/OpenAI listo)
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

        // Flags/props adicionales
        this.isAzureOpenAI = false;
        this.embeddingModel = null;         // En Azure: nombre del deployment; en OpenAI público: nombre del modelo
        this.vectorField = null;            // Nombre del campo vector en el índice

        console.log('🔍 Inicializando Document Service...');
        this.initializeOpenAI();
        this.initializeAzureSearch();
        
        // Guardar instancia singleton
        DocumentService.instance = this;
        
        console.log(`✅ Document Service inicializado - Search: ${this.searchAvailable}, OpenAI: ${this.openaiAvailable}`);
    }

    /**
     * Inicializa el cliente de OpenAI/Azure OpenAI para embeddings
     * Soporta:
     *  - Azure OpenAI (recomendado): usa endpoint + deployment + api-version
     *  - OpenAI público: usa apiKey y modelo por defecto
     *
     * Variables soportadas (Azure):
     *  - AZURE_OPENAI_ENDPOINT | OPENAI_ENDPOINT (ej: https://xxx-eastus2.openai.azure.com)
     *  - AZURE_OPENAI_API_KEY | OPENAI_API_KEY
     *  - AZURE_OPENAI_API_VERSION | OPENAI_API_VERSION (ej: 2024-12-01-preview)
     *  - AZURE_OPENAI_EMBEDDINGS_DEPLOYMENT | OPENAI_EMBEDDINGS_DEPLOYMENT | OPENAI_DEPLOYMENT (nombre del deployment)
     *  - AZURE_OPENAI_EMBEDDINGS_DIMENSIONS (opcional; muchas veces NO se usa en Azure)
     *
     * Variables soportadas (OpenAI público):
     *  - OPENAI_API_KEY
     *  - OPENAI_EMBEDDINGS_MODEL (default: text-embedding-3-large)
     *  - OPENAI_EMBEDDINGS_DIMENSIONS (opcional)
     */
    initializeOpenAI() {
        try {
            // Detectar modo Azure vs público
            const endpoint =
                process.env.AZURE_OPENAI_ENDPOINT ||
                process.env.OPENAI_ENDPOINT || // alias permitido
                null;

            const apiKey =
                process.env.AZURE_OPENAI_API_KEY ||
                process.env.OPENAI_API_KEY ||
                null;

            if (!apiKey) {
                console.warn('⚠️ OpenAI/Azure OpenAI no configurado para embeddings en DocumentService (falta API key)');
                this.openaiAvailable = false;
                return;
            }

            if (endpoint) {
                // ----- MODO AZURE OPENAI -----
                const apiVersion =
                    process.env.AZURE_OPENAI_API_VERSION ||
                    process.env.OPENAI_API_VERSION ||
                    '2024-12-01-preview';

                const deploymentName =
                    process.env.AZURE_OPENAI_EMBEDDINGS_DEPLOYMENT ||
                    process.env.OPENAI_EMBEDDINGS_DEPLOYMENT ||
                    process.env.OPENAI_DEPLOYMENT ||
                    null;

                if (!deploymentName) {
                    console.warn('⚠️ Falta el nombre del deployment de embeddings para Azure (AZURE_OPENAI_EMBEDDINGS_DEPLOYMENT / OPENAI_DEPLOYMENT).');
                    this.openaiAvailable = false;
                    this.initializationError = 'Falta deployment de embeddings en Azure OpenAI';
                    return;
                }

                // En Azure, el "model" es el **nombre del deployment**
                this.openai = new OpenAI({
                    apiKey, // requerido para el header 'api-key'
                    baseURL: `${endpoint}/openai/deployments/${deploymentName}`,
                    defaultHeaders: { 'api-key': apiKey },
                    defaultQuery: { 'api-version': apiVersion },
                    timeout: 30000
                });

                this.isAzureOpenAI = true;
                this.embeddingModel = deploymentName;

                console.log('✅ Azure OpenAI configurado para embeddings en DocumentService');
                console.log('   Endpoint:', endpoint);
                console.log('   Deployment:', deploymentName);
                console.log('   API Version:', apiVersion);
            } else {
                // ----- MODO OPENAI PÚBLICO -----
                const model =
                    process.env.OPENAI_EMBEDDINGS_MODEL ||
                    'text-embedding-3-large';

                this.openai = new OpenAI({
                    apiKey,
                    timeout: 30000
                });

                this.isAzureOpenAI = false;
                this.embeddingModel = model;

                console.log('✅ OpenAI público configurado para embeddings en DocumentService');
                console.log('   Modelo:', model);
            }

            this.openaiAvailable = true;
        } catch (error) {
            console.error('❌ Error inicializando OpenAI/Azure OpenAI para DocumentService:', error);
            this.openaiAvailable = false;
            this.initializationError = error.message;
        }
    }

    /**
     * Inicializa el cliente de Azure Search
     */
    initializeAzureSearch() {
        try {
            const endpoint = process.env.AZURE_SEARCH_ENDPOINT || process.env.SEARCH_ENDPOINT;
            const apiKey = process.env.AZURE_SEARCH_API_KEY || process.env.SEARCH_API_KEY;
            const indexName = process.env.AZURE_SEARCH_INDEX || 'nova';
            const vectorField = process.env.AZURE_SEARCH_VECTOR_FIELD || 'Embedding';

            console.log('🔍 Configuración Azure Search:', {
                endpoint: endpoint ? '✅ Configurado' : '❌ Faltante',
                apiKey: apiKey ? '✅ Configurado' : '❌ Faltante',
                indexName,
                vectorField
            });

            if (!endpoint || !apiKey) {
                console.warn('⚠️ Azure Search no configurado - Variables faltantes');
                console.warn('   Requeridas: AZURE_SEARCH_ENDPOINT, AZURE_SEARCH_API_KEY');
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
            this.vectorField = vectorField;
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
            const testResults = await this.searchClient.search('*', { 
                top: 1,
                select: ['*']
            });
            // Recorrer para forzar la petición
            for await (const _ of testResults.results) { /* no-op */ }
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
            
            // Intentar crear embedding si OpenAI/Azure OpenAI está disponible
            if (this.openaiAvailable) {
                try {
                    console.log(`🧠 [${userId}] Creando embedding para búsqueda vectorial...`);

                    const embReq = {
                        // En Azure: el "model" es el nombre del deployment.
                        // En OpenAI público: es el nombre del modelo, p.ej. text-embedding-3-large
                        model: this.embeddingModel,
                        input: consulta
                    };

                    // Dimensions:
                    // - Azure: muchas veces NO se permite; sólo usar si el usuario lo pide expresamente.
                    // - Público: se puede pasar si se define.
                    const dimsAzure = process.env.AZURE_OPENAI_EMBEDDINGS_DIMENSIONS;
                    const dimsOpenAI = process.env.OPENAI_EMBEDDINGS_DIMENSIONS;

                    if (this.isAzureOpenAI) {
                        if (dimsAzure) {
                            const d = parseInt(dimsAzure, 10);
                            if (Number.isFinite(d) && d > 0) embReq.dimensions = d;
                        }
                    } else {
                        if (dimsOpenAI) {
                            const d = parseInt(dimsOpenAI, 10);
                            if (Number.isFinite(d) && d > 0) embReq.dimensions = d;
                        }
                    }

                    const embedding = await this.openai.embeddings.create(embReq);
                    const vector = embedding.data?.[0]?.embedding;

                    if (!Array.isArray(vector)) {
                        throw new Error('Embedding no retornó un vector válido');
                    }

                    console.log(`✅ [${userId}] Embedding creado con ${vector.length} dimensiones`);
                    
                    vectorQuery = {
                        vector,
                        kNearestNeighbors: 10,
                        fields: this.vectorField // nombre del campo vector en tu índice
                    };
                } catch (embError) {
                    console.warn(`⚠️ [${userId}] No se pudo crear embedding: ${embError.message}`);
                }
            }
            
            // Configurar opciones de búsqueda
            const searchOptions = {
                select: ['Chunk', 'FileName'],
                top: 15,
                searchMode: 'any',
                queryType: 'full'
            };
            
            // Agregar vector query si está disponible (búsqueda híbrida: vector + keywords)
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
                const doc = result.document || {};
                const score = result.score || 0;
                
                const fileName = doc.FileName || '(sin nombre)';
                const chunkSrc = doc.Chunk || '';
                const chunk = chunkSrc.substring(0, 300) + (chunkSrc.length > 300 ? '...' : '');
                
                console.log(`📄 [${userId}] Encontrado: ${fileName} (score: ${score.toFixed(3)})`);
                
                // Crear clave única para evitar duplicados
                const documentKey = `${fileName}-${chunkSrc.substring(0, 50)}`;
                
                if (!documentosProcesados.has(documentKey)) {
                    documentosProcesados.add(documentKey);
                    resultados.push({
                        fileName,
                        chunk,
                        score
                    });
                }
                
                if (resultados.length >= 7) break;
            }
            
            // Si no tenemos suficientes resultados, intentar búsqueda más amplia
            if (resultados.length < 7) {
                console.log(`⚠️ [${userId}] Solo ${resultados.length} resultados, intentando búsqueda amplia...`);
                
                const palabrasConsulta = (consulta || '').split(' ').filter(Boolean);
                if (palabrasConsulta.length > 1) {
                    const consultaAmplia = palabrasConsulta[0];
                    console.log(`🔍 [${userId}] Búsqueda amplia: "${consultaAmplia}"`);
                    
                    const searchResultsAmplia = await this.searchClient.search(consultaAmplia, {
                        select: ['Chunk', 'FileName'],
                        top: 10,
                        searchMode: 'any'
                    });
                    
                    for await (const result of searchResultsAmplia.results) {
                        const doc = result.document || {};
                        const chunkSrc = doc.Chunk || '';
                        const chunk = chunkSrc.substring(0, 300) + (chunkSrc.length > 300 ? '...' : '');
                        const fileName = doc.FileName || '(sin nombre)';
                        const documentKey = `${fileName}-${chunkSrc.substring(0, 50)}`;
                        
                        if (!documentosProcesados.has(documentKey)) {
                            documentosProcesados.add(documentKey);
                            resultados.push({
                                fileName,
                                chunk,
                                score: result.score || 0
                            });
                            console.log(`📄 [${userId}] Agregado desde búsqueda amplia: ${fileName}`);
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
        if (!Array.isArray(resultados) || resultados.length === 0) {
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

        const terminos = politicasComunes[tipoPolitica?.toLowerCase?.()] || tipoPolitica;
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
        if (Array.isArray(highlights) && highlights.length > 0) {
            return highlights.join(" ... ");
        }

        // Si no hay highlights, extraer contexto alrededor de las palabras clave
        const palabrasClave = (consulta || '').toLowerCase().split(' ').filter(p => p.length > 2);
        const lineas = (contenido || '').split('\n');
        const lineasRelevantes = [];

        for (const linea of lineas) {
            const lineaLower = (linea || '').toLowerCase();
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
        
        const consultaLower = (consulta || '').toLowerCase();
        
        if (consultaLower.includes('política') || consultaLower.includes('politica')) {
            const tiposPolitica = ['vacaciones', 'horario', 'vestimenta', 'conducta', 'seguridad', 'prestaciones'];
            const tipoPolitica = tiposPolitica.find(tipo => consultaLower.includes(tipo));
            if (tipoPolitica) {
                console.log(`🎯 [${userId}] Detectada consulta de política: ${tipoPolitica}`);
                return await this.buscarPoliticas(tipoPolitica, userId);
            }
        }
        
        if (consultaLower.includes('feriado') || consultaLower.includes('festivo')) {
            const añoMatch = consulta.match(/\b(20\d{2})\b/);
            const año = añoMatch ? parseInt(añoMatch[1], 10) : new Date().getFullYear();
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
            isAzureOpenAI: this.isAzureOpenAI,
            indexName: this.indexName || 'No configurado',
            vectorField: this.vectorField || 'No configurado',
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
                isAzureOpenAI: this.isAzureOpenAI,
                indexName: this.indexName,
                vectorField: this.vectorField,
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
