// services/documentService.js - Servicio de Azure Search con embeddings vectoriales (Azure OpenAI corregido)
const { SearchClient, AzureKeyCredential } = require('@azure/search-documents');
const { OpenAIClient, AzureKeyCredential: OpenAIKeyCredential } = require('@azure/openai');
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
        this.embeddingModel = null;
        this.vectorField = null;
        this.openaiClient = null;

        console.log('🔍 Inicializando Document Service...');
        this.initializeOpenAI();
        this.initializeAzureSearch();
        
        // Guardar instancia singleton
        DocumentService.instance = this;
        
        console.log(`✅ Document Service inicializado - Search: ${this.searchAvailable}, OpenAI: ${this.openaiAvailable}`);
    }

    /**
     * Inicializa el cliente de OpenAI/Azure OpenAI para embeddings
     */
    initializeOpenAI() {
        try {
            // Detectar modo Azure vs público
            const azureEndpoint = process.env.AZURE_OPENAI_ENDPOINT;
            const azureApiKey = process.env.AZURE_OPENAI_API_KEY;
            const openaiApiKey = process.env.OPENAI_API_KEY;

            if (azureEndpoint && azureApiKey) {
                // ----- MODO AZURE OPENAI -----
                console.log('🔧 Configurando Azure OpenAI...');
                
                const apiVersion = process.env.AZURE_OPENAI_API_VERSION || '2024-02-15-preview';
                const deploymentName = process.env.AZURE_OPENAI_EMBEDDINGS_DEPLOYMENT;

                if (!deploymentName) {
                    throw new Error('Falta AZURE_OPENAI_EMBEDDINGS_DEPLOYMENT');
                }

                // Usar el cliente oficial de Azure OpenAI
                this.openaiClient = new OpenAIClient(
                    azureEndpoint,
                    new OpenAIKeyCredential(azureApiKey),
                    {
                        apiVersion: apiVersion
                    }
                );

                this.isAzureOpenAI = true;
                this.embeddingModel = deploymentName;

                console.log('✅ Azure OpenAI configurado correctamente');
                console.log('   Endpoint:', azureEndpoint);
                console.log('   Deployment:', deploymentName);
                console.log('   API Version:', apiVersion);

            } else if (openaiApiKey) {
                // ----- MODO OPENAI PÚBLICO -----
                console.log('🔧 Configurando OpenAI público...');
                
                const model = process.env.OPENAI_EMBEDDINGS_MODEL || 'text-embedding-3-large';

                this.openaiClient = new OpenAI({
                    apiKey: openaiApiKey,
                    timeout: 30000
                });

                this.isAzureOpenAI = false;
                this.embeddingModel = model;

                console.log('✅ OpenAI público configurado correctamente');
                console.log('   Modelo:', model);
            } else {
                throw new Error('No se encontraron credenciales válidas para OpenAI o Azure OpenAI');
            }

            this.openaiAvailable = true;

            // Test de conectividad
            this.testEmbeddingConnection();

        } catch (error) {
            console.error('❌ Error inicializando OpenAI/Azure OpenAI:', error.message);
            this.openaiAvailable = false;
            this.initializationError = error.message;
        }
    }

    /**
     * Test de conectividad con el servicio de embeddings
     */
    async testEmbeddingConnection() {
        try {
            console.log('🧪 Probando conectividad con servicio de embeddings...');
            const testText = 'test';
            
            if (this.isAzureOpenAI) {
                const result = await this.openaiClient.getEmbeddings(this.embeddingModel, [testText]);
                if (result?.data?.[0]?.embedding) {
                    console.log('✅ Test de Azure OpenAI embeddings exitoso');
                } else {
                    throw new Error('Respuesta inválida del servicio de embeddings');
                }
            } else {
                const result = await this.openaiClient.embeddings.create({
                    model: this.embeddingModel,
                    input: testText
                });
                if (result?.data?.[0]?.embedding) {
                    console.log('✅ Test de OpenAI embeddings exitoso');
                } else {
                    throw new Error('Respuesta inválida del servicio de embeddings');
                }
            }
        } catch (error) {
            console.warn('⚠️ Test de embeddings falló:', error.message);
            // No marcamos como no disponible, solo advertimos
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
                endpoint: endpoint ? '✅ Configurado' : '❌ Faltante',
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
            console.log(`   Endpoint: ${endpoint}`);
            console.log(`   Index: ${indexName}`);
            console.log(`   Vector Field: ${vectorField}`);
            
            // Test básico de conectividad
            this.testSearchConnection();
            
        } catch (error) {
            console.error('❌ Error inicializando Azure Search:', error.message);
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
            
            // Forzar la ejecución de la consulta
            let count = 0;
            for await (const result of testResults.results) {
                count++;
                break; // Solo necesitamos uno para el test
            }
            
            console.log(`✅ Test de conectividad Azure Search exitoso (${count} documento de prueba)`);
        } catch (error) {
            console.warn('⚠️ Test de conectividad Azure Search falló:', error.message);
            
            if (error.statusCode === 403) {
                console.warn('   → Problema de permisos en la API Key');
            } else if (error.statusCode === 404) {
                console.warn('   → Problema con el endpoint o nombre del índice');
            } else if (error.code === 'ENOTFOUND') {
                console.warn('   → No se puede resolver el endpoint');
            }
        }
    }

    /**
     * Crea embedding usando el servicio configurado
     */
    async createEmbedding(text) {
        if (!this.openaiAvailable) {
            throw new Error('Servicio de embeddings no disponible');
        }

        try {
            if (this.isAzureOpenAI) {
                // Usar cliente oficial de Azure OpenAI
                const result = await this.openaiClient.getEmbeddings(this.embeddingModel, [text]);
                
                if (!result?.data?.[0]?.embedding) {
                    throw new Error('No se recibió embedding válido de Azure OpenAI');
                }
                
                return result.data[0].embedding;
                
            } else {
                // Usar cliente de OpenAI público
                const embReq = {
                    model: this.embeddingModel,
                    input: text
                };

                // Agregar dimensiones si está configurado
                const dimensions = process.env.OPENAI_EMBEDDINGS_DIMENSIONS;
                if (dimensions) {
                    const d = parseInt(dimensions, 10);
                    if (Number.isFinite(d) && d > 0) {
                        embReq.dimensions = d;
                    }
                }

                const result = await this.openaiClient.embeddings.create(embReq);
                
                if (!result?.data?.[0]?.embedding) {
                    throw new Error('No se recibió embedding válido de OpenAI');
                }
                
                return result.data[0].embedding;
            }
        } catch (error) {
            console.error('❌ Error creando embedding:', error.message);
            throw new Error(`Error creando embedding: ${error.message}`);
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
            
            // Intentar crear embedding si está disponible
            if (this.openaiAvailable) {
                try {
                    console.log(`🧠 [${userId}] Creando embedding para búsqueda vectorial...`);
                    
                    const vector = await this.createEmbedding(consulta);
                    
                    console.log(`✅ [${userId}] Embedding creado con ${vector.length} dimensiones`);
                    
                    vectorQuery = {
                        vector: vector,
                        kNearestNeighbors: 10,
                        fields: this.vectorField
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
            
            // Agregar vector query si está disponible
            if (vectorQuery) {
                searchOptions.vectorQueries = [vectorQuery];
                console.log(`🎯 [${userId}] Usando búsqueda híbrida (vector + texto)`);
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
                const chunk = chunkSrc.substring(0, 400) + (chunkSrc.length > 400 ? '...' : '');
                
                console.log(`📄 [${userId}] Encontrado: ${fileName} (score: ${score.toFixed(3)})`);
                
                // Crear clave única para evitar duplicados
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
            
            // Si no tenemos suficientes resultados, intentar búsqueda más amplia
            if (resultados.length < 5) {
                console.log(`⚠️ [${userId}] Solo ${resultados.length} resultados, intentando búsqueda amplia...`);
                await this.ampliarBusqueda(consulta, resultados, documentosProcesados, userId);
            }
            
            console.log(`📊 [${userId}] Total resultados encontrados: ${resultados.length}`);
            
            return this.formatearResultados(resultados, consulta, userId);
                
        } catch (error) {
            console.error(`❌ [${userId}] Error en búsqueda de documentos:`, error);
            return `❌ **Error en búsqueda de documentos**: ${error.message}`;
        }
    }

    /**
     * Amplía la búsqueda con términos más generales
     */
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

        const hasVectorSearch = this.openaiAvailable ? ' con búsqueda vectorial' : '';
        respuesta += `\n\n💡 **Búsqueda realizada${hasVectorSearch}**`;
        respuesta += `\n¿Necesitas más información sobre algún documento específico?`;
        
        return respuesta;
    }

    /**
     * Busca políticas específicas
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
        
        if (resultado.includes("No se encontraron documentos")) {
            console.log(`🔄 [${userId}] No se encontraron feriados específicos, buscando política general`);
            return await this.buscarDocumentos("días feriados festivos oficiales política", userId);
        }
        
        return resultado;
    }

    /**
     * Búsqueda general de documentos (wrapper principal)
     */
    async buscarDocumentosGenerales(consulta, userId = 'unknown') {
        console.log(`📖 [${userId}] Búsqueda general de documentos: "${consulta}"`);
        
        const consultaLower = (consulta || '').toLowerCase();
        
        // Detectar tipo de consulta
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

    /**
     * Obtiene estadísticas del servicio
     */
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