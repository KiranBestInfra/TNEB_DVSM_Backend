import { Server } from 'socket.io';
import logger from '../../utils/logger.js';
import { regionSocketHandler } from './handlers/regionSocketHandler.js';
import { edcSocketHandler } from './handlers/edcSocketHandler.js';
import { substationSocketHandler } from './handlers/substationSocketHandler.js';
import { feederSocketHandler } from './handlers/feederSocketHandler.js';
import { profileSocketHandler } from './handlers/profileSocketHandler.js';
import { ticketSocketHandler } from './handlers/ticketSocketHandler.js';
import { logSocketHandler } from './handlers/logSocketHandler.js';

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
            edcSocketHandler.initialize(socket);
            substationSocketHandler.initialize(socket);
            feederSocketHandler.initialize(socket);
            profileSocketHandler.initialize(socket);
            ticketSocketHandler.initialize(socket);
            logSocketHandler.initialize(socket);

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
