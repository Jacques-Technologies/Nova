// services/documentService.js - CÓDIGO COMPLETO CORREGIDO
const { SearchClient, AzureKeyCredential } = require('@azure/search-documents');
const OpenAI = require('openai');
require('dotenv').config();

/**
 * Servicio corregido para búsqueda de documentos usando Azure Search con embeddings vectoriales
 * INTEGRACIÓN COMPLETA Y FUNCIONAL con Azure OpenAI
 */
class DocumentService {
    constructor() {
        if (DocumentService.instance) {
            return DocumentService.instance;
        }
        
        this.searchAvailable = false;
        this.openaiAvailable = false;
        this.initializationError = null;
        this.isAzureOpenAI = true; // Siempre Azure OpenAI
        this.embeddingModel = null;
        this.vectorField = 'Embedding'; // Campo correcto según tu índice
        this.openaiClient = null;

        console.log('🔍 Inicializando Document Service...');
        this.initializeAzureSearch();
        this.initializeOpenAI();
        
        DocumentService.instance = this;
        console.log(`✅ Document Service inicializado - Search: ${this.searchAvailable}, OpenAI: ${this.openaiAvailable}`);
    }

    /**
     * ✅ CORREGIDO: Inicialización Azure Search
     */
    initializeAzureSearch() {
        try {
            const endpoint = process.env.AZURE_SEARCH_ENDPOINT;
            const apiKey = process.env.AZURE_SEARCH_API_KEY;
            const indexName = 'nova';

            console.log('🔍 Configuración Azure Search:', {
                endpoint: endpoint ? `✅ ${endpoint}` : '❌ Faltante',
                apiKey: apiKey ? '✅ Configurado' : '❌ Faltante',
                indexName
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
            this.searchAvailable = true;
            
            console.log(`✅ Azure Search configurado correctamente`);
            console.log(`   Index: ${indexName}`);
            console.log(`   Vector Field: ${this.vectorField}`);
            
            // Test de conectividad en background
            this.testSearchConnection();
            
        } catch (error) {
            console.error('❌ Error inicializando Azure Search:', error.message);
            this.searchAvailable = false;
            this.initializationError = error.message;
        }
    }

    /**
     * ✅ CORREGIDO: Inicialización Azure OpenAI para embeddings
     */
    initializeOpenAI() {
        try {
            console.log('🔧 [DocumentService] Inicializando Azure OpenAI para embeddings...');
            
            const azureOpenaiEndpoint = process.env.OPENAI_ENDPOINT;
            const azureOpenaiKey = process.env.OPENAI_API_KEY;
            
            if (!azureOpenaiEndpoint || !azureOpenaiKey) {
                throw new Error('Variables OPENAI_ENDPOINT y OPENAI_API_KEY requeridas para DocumentService');
            }

            console.log('🔧 [DocumentService] Configurando Azure OpenAI...');
            console.log('   Endpoint:', azureOpenaiEndpoint);
            
            // ===== CONFIGURACIÓN ESPECÍFICA PARA EMBEDDINGS =====
            const embeddingDeployment = 'text-embedding-3-large';
            const apiVersion = '2024-02-15-preview';
            
            // Construir URL correcta para el deployment de embeddings
            const baseURL = `${azureOpenaiEndpoint}/openai/deployments/${embeddingDeployment}`;
            
            this.openaiClient = new OpenAI({
                apiKey: azureOpenaiKey,
                baseURL: baseURL,
                defaultQuery: { 'api-version': apiVersion },
                defaultHeaders: {
                    'api-key': azureOpenaiKey,
                    'Content-Type': 'application/json'
                },
                timeout: 30000
            });

            this.embeddingModel = embeddingDeployment;
            this.openaiAvailable = true;
            
            console.log('✅ [DocumentService] Azure OpenAI configurado:');
            console.log('   Deployment:', embeddingDeployment);
            console.log('   Base URL:', baseURL);
            console.log('   API Version:', apiVersion);
            
            // Test de conectividad
            this.testEmbeddingConnection();

        } catch (error) {
            console.error('❌ [DocumentService] Error inicializando Azure OpenAI:', error.message);
            this.openaiAvailable = false;
            this.initializationError = error.message;
        }
    }

    /**
     * ✅ CORREGIDO: Test de conectividad con Azure OpenAI embeddings
     */
    async testEmbeddingConnection() {
        try {
            console.log('🧪 [DocumentService] Probando conectividad con Azure OpenAI embeddings...');
            
            const testText = 'test connectivity for document service embeddings';
            console.log(`📡 [DocumentService] Test con deployment: ${this.embeddingModel}`);
            
            const result = await this.openaiClient.embeddings.create({
                input: testText
                // NO incluir 'model' para Azure OpenAI - el deployment está en la URL
            });
            
            if (result?.data?.[0]?.embedding) {
                const vectorLength = result.data[0].embedding.length;
                console.log(`✅ [DocumentService] Test de embeddings exitoso:`);
                console.log(`   Deployment: ${this.embeddingModel}`);
                console.log(`   Dimensiones: ${vectorLength}`);
                console.log(`   Endpoint: ${process.env.OPENAI_ENDPOINT}`);
                return true;
            } else {
                throw new Error('Respuesta inválida del servicio de embeddings');
            }
            
        } catch (error) {
            console.error('❌ [DocumentService] Test de embeddings falló:', {
                message: error.message,
                status: error.status,
                code: error.code,
                deployment: this.embeddingModel
            });
            
            if (error.status === 404) {
                console.error(`❌ [DocumentService] PROBLEMA: Deployment '${this.embeddingModel}' no encontrado`);
                console.error('💡 [DocumentService] Verifica que el deployment existe en Azure OpenAI');
            } else if (error.status === 401) {
                console.error('❌ [DocumentService] PROBLEMA: Error de autenticación');
                console.error('💡 [DocumentService] Verifica OPENAI_API_KEY');
            }
            
            this.openaiAvailable = false;
            return false;
        }
    }

    /**
     * ✅ CORREGIDO: Test de conectividad Azure Search
     */
    async testSearchConnection() {
        try {
            console.log('🧪 [DocumentService] Probando conectividad con Azure Search...');
            
            const indexStats = await this.searchClient.getIndexStatistics();
            console.log('📊 Estadísticas del índice:', {
                documentCount: indexStats.documentCount,
                storageSize: indexStats.storageSize
            });
            
            const testResults = await this.searchClient.search('*', { 
                top: 1,
                select: ['FileName'],
                includeTotalCount: true
            });
            
            let totalCount = testResults.count || 0;
            console.log(`✅ [DocumentService] Azure Search conectado exitosamente`);
            console.log(`   Documentos en índice: ${totalCount}`);
            
            return true;
            
        } catch (error) {
            console.error('❌ [DocumentService] Test Azure Search falló:', {
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
     * ✅ CORREGIDO: Crear embedding usando Azure OpenAI
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

            console.log(`🧠 [DocumentService] Creando embedding: "${cleanText.substring(0, 50)}..."`);
            
            const embeddingRequest = {
                input: cleanText
                // NO usar 'model' para Azure OpenAI - el deployment está en baseURL
            };

            console.log('📡 [DocumentService] Request de embedding:', {
                inputLength: cleanText.length,
                deployment: this.embeddingModel,
                isAzure: this.isAzureOpenAI
            });

            const startTime = Date.now();
            const result = await this.openaiClient.embeddings.create(embeddingRequest);
            const duration = Date.now() - startTime;
            
            if (!result?.data?.[0]?.embedding) {
                console.error('❌ [DocumentService] Respuesta inválida:', result);
                throw new Error('No se recibió embedding válido');
            }
            
            const embedding = result.data[0].embedding;
            console.log(`✅ [DocumentService] Embedding creado en ${duration}ms (${embedding.length} dimensiones)`);
            
            return embedding;
                
        } catch (error) {
            console.error('❌ [DocumentService] Error creando embedding:', {
                message: error.message,
                status: error.status,
                code: error.code,
                type: error.type,
                response: error.response?.data
            });
            
            if (error.status === 401) {
                throw new Error('Error de autenticación con Azure OpenAI - verifica OPENAI_API_KEY');
            } else if (error.status === 404) {
                throw new Error(`Deployment '${this.embeddingModel}' no encontrado en Azure OpenAI`);
            } else if (error.message.includes('DeploymentNotFound')) {
                throw new Error(`El deployment '${this.embeddingModel}' no existe`);
            } else {
                throw new Error(`Error creando embedding: ${error.message}`);
            }
        }
    }

    /**
     * ✅ MÉTODO PRINCIPAL: Buscar documentos (HÍBRIDO: Vector + Texto)
     */
    async buscarDocumentos(consulta, userId = 'unknown') {
        if (!this.searchAvailable) {
            return `⚠️ **Servicio de búsqueda no disponible**\n\n${this.initializationError || 'Azure Search no configurado'}`;
        }

        try {
            console.log(`🔍 [${userId}] Iniciando búsqueda: "${consulta}"`);

            let vectorQuery = null;
            
            // ✅ Intentar crear embedding para búsqueda vectorial
            if (this.openaiAvailable) {
                try {
                    console.log(`🧠 [${userId}] Creando embedding para búsqueda vectorial...`);
                    
                    const vector = await this.createEmbedding(consulta);
                    
                    vectorQuery = {
                        vector: vector,
                        kNearestNeighbors: 15,
                        fields: this.vectorField
                    };
                    
                    console.log(`✅ [${userId}] Vector query configurado (${vector.length}D) para campo '${this.vectorField}'`);
                    
                } catch (embError) {
                    console.error(`❌ [${userId}] Error creando embedding:`, embError.message);
                    console.log(`🔄 [${userId}] Continuando con búsqueda solo textual`);
                }
            }
            
            // ✅ Configurar opciones de búsqueda
            const searchOptions = {
                select: ['Chunk', 'FileName', 'Folder'],
                top: 20,
                searchMode: 'any',
                queryType: 'full',
                includeTotalCount: true
            };
            
            // ✅ Agregar vector query si está disponible
            if (vectorQuery) {
                searchOptions.vectorQueries = [vectorQuery];
                console.log(`🎯 [${userId}] Ejecutando búsqueda HÍBRIDA (vector + texto)`);
            } else {
                console.log(`📝 [${userId}] Ejecutando búsqueda SOLO TEXTO`);
            }

            console.log('🔎 [DocumentService] Opciones de búsqueda:', {
                searchText: consulta,
                hasVectorQuery: !!vectorQuery,
                vectorField: this.vectorField,
                kNearestNeighbors: vectorQuery?.kNearestNeighbors,
                top: searchOptions.top
            });
            
            // ✅ Ejecutar búsqueda
            const searchResults = await this.searchClient.search(consulta, searchOptions);

            console.log(`🔍 [${userId}] Procesando resultados... Total: ${searchResults.count || 'N/A'}`);
            
            const resultados = [];
            const documentosProcesados = new Set();
            
            for await (const result of searchResults.results) {
                const doc = result.document || {};
                const score = result.score || 0;
                
                const fileName = doc.FileName || '(sin nombre)';
                const folder = doc.Folder || '';
                const chunkSrc = doc.Chunk || '';
                const chunk = chunkSrc.substring(0, 400) + (chunkSrc.length > 400 ? '...' : '');
                
                console.log(`📄 [${userId}] Resultado: ${fileName} (score: ${score.toFixed(3)})`);
                
                // Evitar duplicados por chunk similar
                const documentKey = `${fileName}-${chunkSrc.substring(0, 50)}`;
                
                if (!documentosProcesados.has(documentKey)) {
                    documentosProcesados.add(documentKey);
                    resultados.push({
                        fileName,
                        folder,
                        chunk,
                        score,
                        fullChunk: chunkSrc
                    });
                }
                
                if (resultados.length >= 10) break; // Limitar resultados
            }
            
            console.log(`📊 [${userId}] Resultados finales: ${resultados.length}`);
            
            // ✅ Si no hay resultados, intentar búsqueda más amplia
            if (resultados.length === 0) {
                console.log(`🔄 [${userId}] Sin resultados, intentando búsqueda ampliada...`);
                return await this.busquedaAmpliada(consulta, userId);
            }
            
            return this.formatearResultados(resultados, consulta, userId);
                
        } catch (error) {
            console.error(`❌ [${userId}] Error en búsqueda:`, {
                message: error.message,
                statusCode: error.statusCode,
                code: error.code,
                stack: error.stack?.split('\n')[0]
            });
            return `❌ **Error en búsqueda de documentos**: ${error.message}`;
        }
    }

    /**
     * ✅ BÚSQUEDA AMPLIADA: Para cuando no hay resultados
     */
    async busquedaAmpliada(consulta, userId) {
        try {
            console.log(`🔄 [${userId}] Ejecutando búsqueda ampliada...`);
            
            // Términos más generales
            const palabras = consulta.split(' ').filter(p => p.length > 2);
            const consultaAmplia = palabras.length > 0 ? palabras[0] : '*';
            
            const searchResults = await this.searchClient.search(consultaAmplia, {
                select: ['Chunk', 'FileName', 'Folder'],
                top: 15,
                searchMode: 'any',
                queryType: 'simple'
            });
            
            const resultados = [];
            for await (const result of searchResults.results) {
                const doc = result.document || {};
                const fileName = doc.FileName || '(sin nombre)';
                const chunkSrc = doc.Chunk || '';
                const chunk = chunkSrc.substring(0, 400) + (chunkSrc.length > 400 ? '...' : '');
                
                resultados.push({
                    fileName,
                    folder: doc.Folder || '',
                    chunk,
                    score: result.score || 0,
                    fullChunk: chunkSrc,
                    fromExtendedSearch: true
                });
                
                if (resultados.length >= 8) break;
            }
            
            if (resultados.length > 0) {
                console.log(`✅ [${userId}] Búsqueda ampliada encontró ${resultados.length} resultados`);
                return this.formatearResultados(resultados, consulta, userId);
            } else {
                return this.sinResultados(consulta, userId);
            }
            
        } catch (error) {
            console.error(`❌ [${userId}] Error en búsqueda ampliada:`, error.message);
            return this.sinResultados(consulta, userId);
        }
    }

    /**
     * ✅ FORMATEAR RESULTADOS
     */
    formatearResultados(resultados, consulta, userId) {
        if (!Array.isArray(resultados) || resultados.length === 0) {
            return this.sinResultados(consulta, userId);
        }

        let respuesta = `🔍 **Búsqueda: "${consulta}"**\n\n`;
        respuesta += `📚 **Documentos encontrados (${resultados.length}):**\n\n`;

        resultados.forEach((resultado, index) => {
            const folderInfo = resultado.folder ? ` [${resultado.folder}]` : '';
            respuesta += `**${index + 1}. ${resultado.fileName}**${folderInfo}`;
            
            if (resultado.score > 0) {
                respuesta += ` (Relevancia: ${(resultado.score * 100).toFixed(1)}%)`;
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
            'Azure OpenAI + Azure Search (Híbrida)' : 
            'Azure Search (Solo texto)';
            
        respuesta += `\n\n💡 **Búsqueda realizada con ${searchType}**`;
        respuesta += `\n¿Necesitas más información sobre algún documento específico?`;
        
        return respuesta;
    }

    /**
     * ✅ MENSAJE CUANDO NO HAY RESULTADOS
     */
    sinResultados(consulta, userId) {
        return `🔍 **Búsqueda: "${consulta}"**\n\n` +
               `❌ No se encontraron documentos relevantes en el índice.\n\n` +
               `💡 **Sugerencias:**\n` +
               `• Intenta con términos más generales\n` +
               `• Verifica la ortografía\n` +
               `• Usa sinónimos o palabras relacionadas\n` +
               `• Pregunta sobre temas más amplios (ej: "políticas", "procedimientos", "nova")\n\n` +
               `📊 **Índice consultado:** ${this.indexName}\n` +
               `🔧 **Tipo de búsqueda:** ${this.openaiAvailable ? 'Híbrida (Vector + Texto)' : 'Solo texto'}`;
    }

    /**
     * ✅ BÚSQUEDAS ESPECIALIZADAS
     */
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
        return await this.buscarDocumentos(terminos, userId);
    }

    async obtenerDiasFeriados(año, userId = 'unknown') {
        const añoActual = año || new Date().getFullYear();
        console.log(`📅 [${userId}] Buscando días feriados para ${añoActual}`);
        
        const consulta = `días feriados festivos ${añoActual} calendario oficial`;
        const resultado = await this.buscarDocumentos(consulta, userId);
        
        if (resultado.includes("No se encontraron documentos")) {
            return await this.buscarDocumentos("días feriados festivos oficiales política", userId);
        }
        
        return resultado;
    }

    async buscarDocumentosGenerales(consulta, userId = 'unknown') {
        console.log(`📖 [${userId}] Búsqueda general: "${consulta}"`);
        
        const consultaLower = (consulta || '').toLowerCase();
        
        if (consultaLower.includes('política') || consultaLower.includes('politica')) {
            const tiposPolitica = ['vacaciones', 'horario', 'vestimenta', 'conducta', 'seguridad', 'prestaciones'];
            const tipoPolitica = tiposPolitica.find(tipo => consultaLower.includes(tipo));
            if (tipoPolitica) {
                return await this.buscarPoliticas(tipoPolitica, userId);
            }
        }
        
        if (consultaLower.includes('feriado') || consultaLower.includes('festivo')) {
            const añoMatch = consulta.match(/\b(20\d{2})\b/);
            const año = añoMatch ? parseInt(añoMatch[1], 10) : new Date().getFullYear();
            return await this.obtenerDiasFeriados(año, userId);
        }
        
        return await this.buscarDocumentos(consulta, userId);
    }

    /**
     * ✅ DIAGNÓSTICO COMPLETO
     */
    async diagnosticarServicio(userId = 'diagnostic') {
        console.log(`🔍 [${userId}] === DIAGNÓSTICO DOCUMENT SERVICE ===`);
        
        const diagnostico = {
            timestamp: new Date().toISOString(),
            configuracion: {
                openai_endpoint: process.env.OPENAI_ENDPOINT ? 'Configurado' : 'FALTANTE',
                openai_api_key: process.env.OPENAI_API_KEY ? 'Configurado' : 'FALTANTE',
                azure_search_endpoint: process.env.AZURE_SEARCH_ENDPOINT ? 'Configurado' : 'FALTANTE',
                azure_search_key: process.env.AZURE_SEARCH_API_KEY ? 'Configurado' : 'FALTANTE'
            },
            servicios: {
                searchAvailable: this.searchAvailable,
                openaiAvailable: this.openaiAvailable,
                embeddingModel: this.embeddingModel,
                vectorField: this.vectorField,
                indexName: this.indexName
            },
            tests: {}
        };
        
        // Test Azure Search
        if (this.searchAvailable) {
            try {
                const stats = await this.searchClient.getIndexStatistics();
                diagnostico.tests.azureSearch = {
                    success: true,
                    documentCount: stats.documentCount,
                    storageSize: stats.storageSize
                };
                console.log(`✅ [${userId}] Azure Search: ${stats.documentCount} documentos`);
            } catch (error) {
                diagnostico.tests.azureSearch = {
                    success: false,
                    error: error.message
                };
            }
        }
        
        // Test OpenAI Embeddings
        if (this.openaiAvailable) {
            try {
                const testEmbedding = await this.createEmbedding('test diagnostic');
                diagnostico.tests.openaiEmbeddings = {
                    success: true,
                    embeddingLength: testEmbedding.length,
                    deployment: this.embeddingModel
                };
                console.log(`✅ [${userId}] OpenAI Embeddings: ${testEmbedding.length}D`);
            } catch (error) {
                diagnostico.tests.openaiEmbeddings = {
                    success: false,
                    error: error.message
                };
            }
        }
        
        // Test búsqueda híbrida
        try {
            const testQuery = 'nova corporación documentos';
            const resultado = await this.buscarDocumentos(testQuery, userId);
            diagnostico.tests.hybridSearch = {
                success: !resultado.includes('Error'),
                hasResults: !resultado.includes('No se encontraron'),
                searchType: this.openaiAvailable ? 'hybrid' : 'text-only'
            };
            console.log(`✅ [${userId}] Búsqueda híbrida: ${diagnostico.tests.hybridSearch.success ? 'OK' : 'Error'}`);
        } catch (error) {
            diagnostico.tests.hybridSearch = {
                success: false,
                error: error.message
            };
        }
        
        return diagnostico;
    }

    // ✅ MÉTODOS DE UTILIDAD
    isAvailable() {
        return this.searchAvailable;
    }

    getConfigInfo() {
        return {
            searchAvailable: this.searchAvailable,
            openaiAvailable: this.openaiAvailable,
            indexName: this.indexName || 'No configurado',
            vectorField: this.vectorField || 'No configurado',
            embeddingModel: this.embeddingModel || 'No configurado',
            error: this.initializationError,
            features: {
                vectorSearch: this.searchAvailable && this.openaiAvailable,
                textSearch: this.searchAvailable,
                policySearch: this.searchAvailable,
                holidaySearch: this.searchAvailable,
                hybridSearch: this.searchAvailable && this.openaiAvailable
            }
        };
    }

    async getStats() {
        try {
            const stats = {
                available: this.searchAvailable,
                searchAvailable: this.searchAvailable,
                openaiAvailable: this.openaiAvailable,
                indexName: this.indexName,
                vectorField: this.vectorField,
                embeddingModel: this.embeddingModel,
                features: this.getConfigInfo().features,
                timestamp: new Date().toISOString(),
                error: this.initializationError
            };

            if (this.searchAvailable) {
                try {
                    const indexStats = await this.searchClient.getIndexStatistics();
                    stats.indexStats = {
                        documentCount: indexStats.documentCount,
                        storageSize: indexStats.storageSize
                    };
                } catch (error) {
                    stats.indexStatsError = error.message;
                }
            }

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