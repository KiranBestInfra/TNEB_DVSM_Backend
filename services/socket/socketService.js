import { Server } from 'socket.io';
import logger from '../../utils/logger.js';
import { regionSocketHandler } from './handlers/regionSocketHandler.js';

class SocketService {
    constructor() {
        this.io = null;
        this.intervalIds = new Map();
    }

    initialize(server) {
        this.io = new Server(server, {
            cors: {
                origin: [
                    'http://localhost:5173',
                    'https://lk-ea.co.in',
                    'http://lk-ea.co.in',
                ],
                methods: ['GET', 'POST'],
                credentials: true,
                allowedHeaders: ['*'],
            },
        });

        this.setupConnectionHandler();
        logger.info('Socket service initialized');
    }

    setupConnectionHandler() {
        this.io.on('connection', (socket) => {
            logger.info('New WebSocket connection established');

            regionSocketHandler.initialize(socket);

            socket.on('disconnect', () => {
                logger.info('Client disconnected from WebSocket');
                if (this.intervalIds.has(socket.id)) {
                    clearInterval(this.intervalIds.get(socket.id));
                    this.intervalIds.delete(socket.id);
                }
            });
        });
    }

    getIO() {
        if (!this.io) {
            throw new Error('Socket.io not initialized!');
        }
        return this.io;
    }

    storeInterval(socketId, intervalId) {
        this.intervalIds.set(socketId, intervalId);
    }

    getInterval(socketId) {
        return this.intervalIds.get(socketId);
    }

    clearInterval(socketId) {
        if (this.intervalIds.has(socketId)) {
            clearInterval(this.intervalIds.get(socketId));
            this.intervalIds.delete(socketId);
        }
    }
}

const socketService = new SocketService();
export default socketService;
