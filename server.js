const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '/')));

const TIMEOUT = 30000;

// Lista de proxies gratuitos para fallback
const PROXIES = [
    'https://cors-anywhere.herokuapp.com/',
    'https://api.allorigins.win/raw?url=',
    'https://corsproxy.io/?'
];

// Função para tentar várias APIs
async function fetchWithProxy(url, retries = 3) {
    // Tentativa 1: Direct
    try {
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'application/json'
            },
            timeout: TIMEOUT
        });
        return response;
    } catch (err) {}
    
    // Tentativa 2: Com proxies
    for (const proxy of PROXIES) {
        for (let i = 0; i < retries; i++) {
            try {
                const proxyUrl = proxy + encodeURIComponent(url);
                const response = await axios.get(proxyUrl, {
                    headers: { 'User-Agent': 'Mozilla/5.0' },
                    timeout: TIMEOUT
                });
                if (response.data) return response;
            } catch (err) {}
        }
    }
    throw new Error('Todas as tentativas falharam');
}

// Endpoint: Resolver link do TikTok (CORRIGIDO)
app.get('/api/video/info', async (req, res) => {
    const { url } = req.query;
    
    if (!url) {
        return res.status(400).json({ error: 'url é obrigatória' });
    }
    
    console.log(`📹 Resolvendo: ${url}`);
    
    try {
        // Usando a API do tikwm
        const apiUrl = `https://tikwm.com/api/?url=${encodeURIComponent(url)}`;
        const response = await fetchWithProxy(apiUrl);
        
        let data = response.data;
        
        // Se veio como string, tenta parsear
        if (typeof data === 'string') {
            try {
                data = JSON.parse(data);
            } catch (e) {}
        }
        
        if (data && data.code === 0 && data.data) {
            const video = data.data;
            const result = {
                code: 0,
                data: {
                    video_id: video.video_id,
                    title: video.title || 'Sem título',
                    cover: video.cover || '',
                    play: video.play || video.hdplay || video.wmplay,
                    hdplay: video.hdplay || video.play,
                    wmplay: video.wmplay || video.play,
                    duration: video.duration || 0,
                    play_count: video.play_count || 0,
                    digg_count: video.digg_count || 0,
                    comment_count: video.comment_count || 0,
                    author: {
                        unique_id: video.author?.unique_id || 'usuario',
                        nickname: video.author?.nickname || 'Usuário',
                        avatar: video.author?.avatar || ''
                    },
                    music: video.music || ''
                }
            };
            console.log(`✅ Vídeo resolvido: ${result.data.video_id}`);
            return res.json(result);
        }
        
        throw new Error('Resposta inválida da API');
        
    } catch (error) {
        console.error('❌ Erro:', error.message);
        res.status(500).json({ 
            error: 'Erro ao buscar vídeo. Tente novamente.', 
            code: -1,
            message: error.message 
        });
    }
});

// Endpoint: Informações do usuário
app.get('/api/user/info', async (req, res) => {
    const { unique_id } = req.query;
    if (!unique_id) {
        return res.status(400).json({ error: 'unique_id é obrigatório' });
    }
    
    console.log(`👤 Buscando perfil: ${unique_id}`);
    
    try {
        const apiUrl = `https://tikwm.com/api/user/info?unique_id=${encodeURIComponent(unique_id)}`;
        const response = await fetchWithProxy(apiUrl);
        
        let data = response.data;
        if (typeof data === 'string') {
            try {
                data = JSON.parse(data);
            } catch (e) {}
        }
        
        if (data && data.code === 0) {
            console.log(`✅ Perfil encontrado: ${unique_id}`);
            return res.json(data);
        }
        
        throw new Error('Perfil não encontrado');
    } catch (error) {
        console.error('❌ Erro:', error.message);
        res.status(500).json({ error: 'Erro ao buscar perfil', code: -1 });
    }
});

// Endpoint: Posts do usuário
app.get('/api/user/posts', async (req, res) => {
    const { unique_id, cursor = 0, count = 21 } = req.query;
    if (!unique_id) {
        return res.status(400).json({ error: 'unique_id é obrigatório' });
    }
    
    try {
        const apiUrl = `https://tikwm.com/api/user/posts?unique_id=${encodeURIComponent(unique_id)}&count=${count}&cursor=${cursor}`;
        const response = await fetchWithProxy(apiUrl);
        
        let data = response.data;
        if (typeof data === 'string') {
            try {
                data = JSON.parse(data);
            } catch (e) {}
        }
        
        if (data && data.code === 0) {
            return res.json(data);
        }
        
        throw new Error('Posts não encontrados');
    } catch (error) {
        console.error('❌ Erro:', error.message);
        res.status(500).json({ error: 'Erro ao buscar vídeos', code: -1 });
    }
});

// Rota principal
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/health', (req, res) => {
    res.json({ status: 'online', timestamp: new Date().toISOString() });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`
    ╔════════════════════════════════════════╗
    ║     🚀 AhaTik Downloader Rodando!      ║
    ╠════════════════════════════════════════╣
    ║  📱 Local: http://localhost:${PORT}     ║
    ║  🌐 Rede: http://SEU_IP_VPS:${PORT}     ║
    ╚════════════════════════════════════════╝
    `);
});
