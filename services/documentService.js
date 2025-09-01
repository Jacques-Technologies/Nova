// services/documentService.js - Servicio corregido de Azure Search con embeddings vectoriales
const { SearchClient, AzureKeyCredential } = require('@azure/search-documents');
const OpenAI = require('openai');
require('dotenv').config();

/**
 * Servicio para búsqueda de documentos usando Azure Search con embeddings vectoriales
 */
class DocumentService {
    constructor() {
        if (DocumentService.instance) {
            return DocumentService.instance;
        }
        
        this.searchAvailable = false;
        this.openaiAvailable = false;
        this.initializationError = null;
        this.isAzureOpenAI = false;
        this.embeddingModel = null;
        this.vectorField = null;
        this.openaiClient = null;

        console.log('🔍 Inicializando Document Service...');
        this.initializeOpenAI();
        this.initializeAzureSearch();
        
        DocumentService.instance = this;
        console.log(`✅ Document Service inicializado - Search: ${this.searchAvailable}, OpenAI: ${this.openaiAvailable}`);
    }

    /**
     * Inicializa el cliente de OpenAI/Azure OpenAI para embeddings
     */
    initializeOpenAI() {
        try {
            // Variables específicas para Azure OpenAI
            const azureOpenaiEndpoint = process.env.AZURE_OPENAI_ENDPOINT;
            const azureOpenaiKey = process.env.AZURE_OPENAI_API_KEY;
            const azureOpenaiDeployment = process.env.AZURE_OPENAI_EMBEDDINGS_DEPLOYMENT || 'text-embedding-3-large';
            
            // Variables para OpenAI público
            const openaiApiKey = process.env.OPENAI_API_KEY;

            if (azureOpenaiEndpoint && azureOpenaiKey) {
                // ----- MODO AZURE OPENAI -----
                console.log('🔧 Configurando Azure OpenAI...');
                
                const apiVersion = process.env.AZURE_OPENAI_API_VERSION || '2024-02-15-preview';

                // Corregir la construcción de baseURL
                const baseURL = `${azureOpenaiEndpoint}/openai/deployments/${azureOpenaiDeployment}`;
                
                this.openaiClient = new OpenAI({
                    apiKey: azureOpenaiKey,
                    baseURL: baseURL,
                    defaultQuery: { 'api-version': apiVersion },
                    defaultHeaders: {
                        'api-key': azureOpenaiKey,
                    },
                    timeout: 30000
                });

                this.isAzureOpenAI = true;
                this.embeddingModel = azureOpenaiDeployment;

                console.log('✅ Azure OpenAI configurado correctamente');
                console.log('   Endpoint:', azureOpenaiEndpoint);
                console.log('   Deployment:', azureOpenaiDeployment);
                console.log('   API Version:', apiVersion);
                console.log('   Base URL:', baseURL);

            } else if (openaiApiKey) {
                // ----- MODO OPENAI PÚBLICO -----
                console.log('🔧 Configurando OpenAI público...');
                
                const model = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-large';

                this.openaiClient = new OpenAI({
                    apiKey: openaiApiKey,
                    timeout: 30000
                });

                this.isAzureOpenAI = false;
                this.embeddingModel = model;

                console.log('✅ OpenAI público configurado correctamente');
                console.log('   Modelo:', model);
            } else {
                throw new Error('No se encontraron credenciales válidas para OpenAI o Azure OpenAI. Verifica las variables: AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY o OPENAI_API_KEY');
            }

            this.openaiAvailable = true;
            this.testEmbeddingConnection();

        } catch (error) {
            console.error('❌ Error inicializando OpenAI/Azure OpenAI:', error.message);
            this.openaiAvailable = false;
            this.initializationError = error.message;
        }
    }

    /**
     * Test mejorado de conectividad con el servicio de embeddings
     */
    async testEmbeddingConnection() {
        try {
            console.log('🧪 Probando conectividad con servicio de embeddings...');
            const testText = 'test connectivity';
            
            const embeddingRequest = {
                input: testText,
                model: this.embeddingModel
            };

            // Solo agregar dimensiones para OpenAI público
            if (!this.isAzureOpenAI) {
                const dimensions = parseInt(process.env.OPENAI_EMBEDDING_DIMENSIONS || '1024', 10);
                if (dimensions > 0) {
                    embeddingRequest.dimensions = dimensions;
                }
            }

            console.log('📡 Enviando request de embedding:', {
                model: this.embeddingModel,
                inputLength: testText.length,
                isAzure: this.isAzureOpenAI,
                dimensions: embeddingRequest.dimensions || 'default'
            });

            const result = await this.openaiClient.embeddings.create(embeddingRequest);
            
            if (result?.data?.[0]?.embedding) {
                const vectorLength = result.data[0].embedding.length;
                console.log(`✅ Test de ${this.isAzureOpenAI ? 'Azure OpenAI' : 'OpenAI'} embeddings exitoso (${vectorLength} dimensiones)`);
                return true;
            } else {
                throw new Error('Respuesta inválida del servicio de embeddings');
            }
        } catch (error) {
            console.error('❌ Test de embeddings falló:', {
                message: error.message,
                status: error.status,
                code: error.code,
                type: error.type,
                isAzure: this.isAzureOpenAI,
                model: this.embeddingModel
            });
            this.openaiAvailable = false;
            return false;
        }
    }

    /**
     * Inicializa el cliente de Azure Search
     */
    initializeAzureSearch() {
        try {
            const endpoint = process.env.AZURE_SEARCH_ENDPOINT;
            const apiKey = process.env.AZURE_SEARCH_API_KEY;
            const indexName = process.env.AZURE_SEARCH_INDEX || 'nova';
            const vectorField = process.env.AZURE_SEARCH_VECTOR_FIELD || 'Embedding';

            console.log('🔍 Configuración Azure Search:', {
                endpoint: endpoint ? `✅ ${endpoint}` : '❌ Faltante',
                apiKey: apiKey ? '✅ Configurado' : '❌ Faltante',
                indexName,
                vectorField
            });

            if (!endpoint || !apiKey) {
                throw new Error('Variables de Azure Search faltantes (AZURE_SEARCH_ENDPOINT, AZURE_SEARCH_API_KEY)');
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
            console.log(`   Index: ${indexName}`);
            console.log(`   Vector Field: ${vectorField}`);
            
            this.testSearchConnection();
            
        } catch (error) {
            console.error('❌ Error inicializando Azure Search:', error.message);
            this.searchAvailable = false;
            this.initializationError = error.message;
        }
    }

    /**
     * Test mejorado de conectividad con Azure Search
     */
    async testSearchConnection() {
        try {
            console.log('🧪 Probando conectividad con Azure Search...');
            
            // Primero intentar obtener estadísticas del índice
            const indexStats = await this.searchClient.getIndexStatistics();
            console.log('📊 Estadísticas del índice:', {
                documentCount: indexStats.documentCount,
                storageSize: indexStats.storageSize
            });
            
            // Luego hacer una búsqueda simple
            const testResults = await this.searchClient.search('*', { 
                top: 1,
                select: ['FileName'],
                includeTotalCount: true
            });
            
            let totalCount = testResults.count || 0;
            console.log(`✅ Test de conectividad Azure Search exitoso`);
            console.log(`   Documentos en índice: ${totalCount}`);
            
            return true;
            
        } catch (error) {
            console.error('❌ Test de conectividad Azure Search falló:', {
                message: error.message,
                statusCode: error.statusCode,
                code: error.code
            });
            
            if (error.statusCode === 403) {
                console.warn('   → Problema de permisos en la API Key');
            } else if (error.statusCode === 404) {
                console.warn('   → Problema con el endpoint o nombre del índice');
            }
            
            return false;
        }
    }

    /**
     * Crea embedding usando el servicio configurado (mejorado con logs)
     */
    async createEmbedding(text) {
        if (!this.openaiAvailable) {
            throw new Error('Servicio de embeddings no disponible');
        }

        try {
            const cleanText = text.trim();
            if (!cleanText) {
                throw new Error('Texto vacío para embedding');
            }

            const embeddingRequest = {
                input: cleanText,
                model: this.embeddingModel
            };

            // Solo agregar dimensiones para OpenAI público
            if (!this.isAzureOpenAI) {
                const dimensions = parseInt(process.env.OPENAI_EMBEDDING_DIMENSIONS || '1024', 10);
                if (dimensions > 0) {
                    embeddingRequest.dimensions = dimensions;
                }
            }

            console.log(`🧠 Creando embedding (${cleanText.substring(0, 50)}...) con ${this.isAzureOpenAI ? 'Azure OpenAI' : 'OpenAI público'}`);
            console.log('📡 Request details:', {
                model: this.embeddingModel,
                textLength: cleanText.length,
                dimensions: embeddingRequest.dimensions || 'default'
            });

            const startTime = Date.now();
            const result = await this.openaiClient.embeddings.create(embeddingRequest);
            const duration = Date.now() - startTime;
            
            if (!result?.data?.[0]?.embedding) {
                console.error('❌ Respuesta inválida:', result);
                throw new Error('No se recibió embedding válido');
            }
            
            const embedding = result.data[0].embedding;
            console.log(`✅ Embedding creado exitosamente en ${duration}ms (${embedding.length} dimensiones)`);
            
            return embedding;
                
        } catch (error) {
            console.error('❌ Error detallado creando embedding:', {
                message: error.message,
                status: error.status,
                code: error.code,
                type: error.type,
                isAzure: this.isAzureOpenAI,
                model: this.embeddingModel,
                textLength: text?.length || 0
            });
            throw new Error(`Error creando embedding: ${error.message}`);
        }
    }

    /**
     * Busca documentos en el índice de Azure Search (con logs mejorados)
     */
    async buscarDocumentos(consulta, userId = 'unknown') {
        if (!this.searchAvailable) {
            return `⚠️ **Servicio de búsqueda no disponible**\n\n${this.initializationError || 'Azure Search no configurado'}`;
        }

        try {
            console.log(`🔍 [${userId}] Iniciando búsqueda: "${consulta}"`);

            let vectorQuery = null;
            
            // Intentar crear embedding si está disponible
            if (this.openaiAvailable) {
                try {
                    console.log(`🧠 [${userId}] Creando embedding para búsqueda vectorial...`);
                    
                    const vector = await this.createEmbedding(consulta);
                    
                    vectorQuery = {
                        vector: vector,
                        kNearestNeighbors: 10,
                        fields: this.vectorField
                    };
                    
                    console.log(`✅ [${userId}] Vector query configurado con ${vector.length} dimensiones para campo '${this.vectorField}'`);
                    
                } catch (embError) {
                    console.error(`❌ [${userId}] Error creando embedding:`, embError.message);
                    console.log(`🔄 [${userId}] Continuando con búsqueda solo textual`);
                }
            }
            
            // Configurar opciones de búsqueda
            const searchOptions = {
                select: ['Chunk', 'FileName'],
                top: 15,
                searchMode: 'any',
                queryType: 'full',
                includeTotalCount: true
            };
            
            // Agregar vector query si está disponible
            if (vectorQuery) {
                searchOptions.vectorQueries = [vectorQuery];
                console.log(`🎯 [${userId}] Ejecutando búsqueda HÍBRIDA (vector + texto)`);
            } else {
                console.log(`📝 [${userId}] Ejecutando búsqueda SOLO TEXTO`);
            }

            console.log('🔎 Search options:', {
                searchText: consulta,
                hasVectorQuery: !!vectorQuery,
                vectorField: vectorQuery?.fields,
                kNearestNeighbors: vectorQuery?.kNearestNeighbors,
                top: searchOptions.top
            });
            
            const searchResults = await this.searchClient.search(consulta, searchOptions);

            console.log(`🔍 [${userId}] Procesando resultados... Total: ${searchResults.count || 'N/A'}`);
            const resultados = [];
            const documentosProcesados = new Set();
            
            for await (const result of searchResults.results) {
                const doc = result.document || {};
                const score = result.score || 0;
                
                const fileName = doc.FileName || '(sin nombre)';
                const chunkSrc = doc.Chunk || '';
                const chunk = chunkSrc.substring(0, 400) + (chunkSrc.length > 400 ? '...' : '');
                
                console.log(`📄 [${userId}] Resultado: ${fileName} (score: ${score.toFixed(3)})`);
                
                const documentKey = `${fileName}-${chunkSrc.substring(0, 50)}`;
                
                if (!documentosProcesados.has(documentKey)) {
                    documentosProcesados.add(documentKey);
                    resultados.push({
                        fileName,
                        chunk,
                        score,
                        fullChunk: chunkSrc
                    });
                }
                
                if (resultados.length >= 8) break;
            }
            
            console.log(`📊 [${userId}] Resultados finales: ${resultados.length}`);
            
            return this.formatearResultados(resultados, consulta, userId);
                
        } catch (error) {
            console.error(`❌ [${userId}] Error detallado en búsqueda:`, {
                message: error.message,
                statusCode: error.statusCode,
                code: error.code,
                stack: error.stack?.split('\n')[0]
            });
            return `❌ **Error en búsqueda de documentos**: ${error.message}`;
        }
    }

    // ... resto de métodos sin cambios ...
    async ampliarBusqueda(consulta, resultados, documentosProcesados, userId) {
        try {
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
                    const chunk = chunkSrc.substring(0, 400) + (chunkSrc.length > 400 ? '...' : '');
                    const fileName = doc.FileName || '(sin nombre)';
                    const documentKey = `${fileName}-${chunkSrc.substring(0, 50)}`;
                    
                    if (!documentosProcesados.has(documentKey) && resultados.length < 8) {
                        documentosProcesados.add(documentKey);
                        resultados.push({
                            fileName,
                            chunk,
                            score: result.score || 0,
                            fullChunk: chunkSrc,
                            fromExtendedSearch: true
                        });
                        console.log(`📄 [${userId}] Agregado desde búsqueda amplia: ${fileName}`);
                    }
                }
            }
        } catch (error) {
            console.warn(`⚠️ [${userId}] Error en búsqueda amplia:`, error.message);
        }
    }

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
                respuesta += `(Relevancia: ${(resultado.score * 100).toFixed(1)}%)`;
            }
            
            if (resultado.fromExtendedSearch) {
                respuesta += ` 🔍`;
            }
            
            respuesta += '\n';
            respuesta += `${resultado.chunk}\n`;
            
            if (index < resultados.length - 1) {
                respuesta += '\n---\n\n';
            }
        });

        const searchType = this.openaiAvailable ? 
            (this.isAzureOpenAI ? 'Azure OpenAI' : 'OpenAI') + ' + Azure Search' : 
            'Azure Search';
            
        respuesta += `\n\n💡 **Búsqueda realizada con ${searchType}**`;
        respuesta += `\n¿Necesitas más información sobre algún documento específico?`;
        
        return respuesta;
    }

    // ... resto de métodos sin cambios (buscarPoliticas, obtenerDiasFeriados, etc.)
    
    async buscarPoliticas(tipoPolitica, userId = 'unknown') {
        console.log(`📋 [${userId}] Buscando políticas: ${tipoPolitica}`);
        
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

    async obtenerDiasFeriados(año, userId = 'unknown') {
        const añoActual = año || new Date().getFullYear();
        console.log(`📅 [${userId}] Buscando días feriados para ${añoActual}`);
        
        const consulta = `días feriados festivos ${añoActual} calendario oficial`;
        const resultado = await this.buscarDocumentos(consulta, userId);
        
        if (resultado.includes("No se encontraron documentos")) {
            console.log(`🔄 [${userId}] No se encontraron feriados específicos, buscando política general`);
            return await this.buscarDocumentos("días feriados festivos oficiales política", userId);
        }
        
        return resultado;
    }

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
        
        return await this.buscarDocumentos(consulta, userId);
    }

    isAvailable() {
        return this.searchAvailable;
    }

    getConfigInfo() {
        return {
            searchAvailable: this.searchAvailable,
            openaiAvailable: this.openaiAvailable,
            isAzureOpenAI: this.isAzureOpenAI,
            indexName: this.indexName || 'No configurado',
            vectorField: this.vectorField || 'No configurado',
            embeddingModel: this.embeddingModel || 'No configurado',
            error: this.initializationError,
            features: {
                vectorSearch: this.searchAvailable && this.openaiAvailable,
                textSearch: this.searchAvailable,
                policySearch: this.searchAvailable,
                holidaySearch: this.searchAvailable
            }
        };
    }

    async getStats() {
        try {
            const stats = {
                available: this.searchAvailable,
                searchAvailable: this.searchAvailable,
                openaiAvailable: this.openaiAvailable,
                isAzureOpenAI: this.isAzureOpenAI,
                indexName: this.indexName,
                vectorField: this.vectorField,
                embeddingModel: this.embeddingModel,
                features: this.getConfigInfo().features,
                timestamp: new Date().toISOString(),
                error: this.initializationError
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