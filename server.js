const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');

async function main() {
  const db = await open({
    filename: 'chat.db',
    driver: sqlite3.Database
  });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sender TEXT,
      recipient TEXT,
      message TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const app = express();
  const server = http.createServer(app);
  const io = new Server(server);

  // Servir el archivo index.html al acceder a la raíz
  app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
  });

  let users = [];
  let sockets = {}; // Para almacenar las conexiones de los usuarios

  io.on('connection', (socket) => {
    let username = '';

    // Establecer el nombre de usuario
    socket.on('set username', async (name) => {
      username = name;
      if (!users.includes(username)) {
        users.push(username);
      }
      sockets[username] = socket; // Almacenar el socket del usuario

      // Emitir lista de usuarios conectados
      io.emit('update users', users);
      console.log(`${username} conectado.`);

      // Cargar mensajes previos si es necesario
      socket.on('request messages', async (recipient) => {
        const messages = await db.all(
          'SELECT sender, recipient, message FROM messages WHERE (sender = ? AND recipient = ?) OR (sender = ? AND recipient = ?)',
          [username, recipient, recipient, username]
        );
        socket.emit('messages loaded', messages);
      });
    });

    // Manejo de los mensajes enviados
    socket.on('chat message', async (msg, recipient) => {
      if (username && recipient) {
        // Guardamos el mensaje en la base de datos
        await db.run('INSERT INTO messages (sender, recipient, message) VALUES (?, ?, ?)', [username, recipient, msg]);

        // Verificamos si el destinatario está conectado
        if (sockets[recipient]) {
          // Emitir el mensaje al destinatario (en tiempo real)
          sockets[recipient].emit('chat message', msg, username, recipient);
        }

        // Emitir el mensaje al remitente (en tiempo real)
        socket.emit('chat message', msg, username, recipient);
      }
    });

    // Manejo de desconexiones
    socket.on('disconnect', () => {
      if (username) {
        users = users.filter(user => user !== username);
        delete sockets[username]; // Eliminar el socket del usuario desconectado
        io.emit('update users', users); // Emitir la lista actualizada
        console.log(`${username} desconectado.`);
      }
    });
  });

  // Iniciar el servidor en el puerto 3000
  server.listen(3000, () => {
    console.log('Servidor corriendo en http://localhost:3000');
  });
}

main();
