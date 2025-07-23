# novabot

Bot de Microsoft Teams construido con Bot Framework, OpenAI y Azure Cosmos DB.

## Prerrequisitos

- Node.js versión 18 a 20  
- NPM instalado  
- Cuenta de Azure (para Cosmos DB y Azure Cognitive Search)  
- Clave de API de OpenAI  
- Archivo `.env` configurado  

## Instalación

```bash
git clone <URL-del-repositorio>
cd Cliente_nuevo
npm install
```

## Variables de entorno

Crea un archivo `.env` en la raíz del proyecto con las siguientes variables:

```env
PORT=3978
MICROSOFT_APP_ID=<tu-app-id>
MICROSOFT_APP_PASSWORD=<tu-app-password>
OPENAI_API_KEY=<tu-openai-key>
```

## Scripts disponibles

- `npm start` – Ejecuta el bot en modo producción  
- `npm run dev` – Ejecuta en modo desarrollo con nodemon  
- `npm run build` – Empaqueta/transpila el código  
- `npm test` – Ejecuta pruebas con Jest  
- `npm run lint` – Ejecuta ESLint en todo el proyecto  

## Estructura de carpetas

```
.
├── appManifest
│   ├── manifest.json
│   ├── color.png
│   ├── outline.png
│   └── manifest.zip
├── bots
│   ├── dialogBot.js
│   └── teamsBot.js
├── dialogs
│   ├── mainDialog.js
│   └── logoutDialog.js
├── services
│   └── openaiService.js
├── build.js
├── index.js
├── package.json
└── README.md
```

## Uso

1. Configura tus variables en `.env`.  
2. Ejecuta `npm run dev`.  
3. Registra la URL de tu bot en Teams, por ejemplo:
   ```
   http://localhost:3978/api/messages
   ```

