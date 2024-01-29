const express = require('express');
const { createServer } = require('node:http');
const { join } = require('node:path');
const { Server } = require('socket.io');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');


async function main() {
    // open the databse file
    const db = await open({
        filename: 'chat.db',
        driver: sqlite3.Database
    });

    await db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_offset TEXT UNIQUE,
        content TEXT
        );
    `);

    const app = express();
    const server = createServer(app);
    const io = new Server(server, {
        connectionStateRecovery: {}
    });

    app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
    });

    io.on('connection', async (socket) => {

        socket.on('chat message', async (msg, clientOffset, callback) => {
            let result;
            try {
                result = await db.run('INSERT INTO messages (content, client_offset) VALUES (?, ?)', msg, clientOffset);
            } catch (e) {
                if (e.errno === 19) {
                    callback();
                } else {
                    // nothing to do, just let the client retry
                }
                return;
            }
            io.emit('chat message', msg, result.lastID);
            callback();
        });

        if (!socket.recovered) {
            try {
                await db.each('SELECT id, content FROM messages WHERE id > ?',
                    [socket.handshake.auth.serverOffset || 0],
                    (_err, row) => {
                        socket.emit('chat message', row.content, row.id);
                    }
                )
            } catch (e) {
                console.log(e);
            }
        }

        console.log('a user connected');

        socket.on('disconnect', () => {
            console.log('user disconnected');
        });

    });


    server.listen(3000, () => {
    console.log('Server listening on port 3000');
    });

}

main();