const fs = require('fs');
const net = require('net');
const crypto = require('crypto');

const server = net.createServer();

const clients = new Map();

server.on('connection', (socket) => {
  console.log('New client connected');

  let fileInfo = null;
  let receivedData = null;
  let expectedSeq = 0;

  // 处理客户端发送的文件信息
  socket.on('data', (data) => {
    if (!fileInfo) {
      fileInfo = JSON.parse(data.toString());
      console.log(`File name: ${fileInfo.filename}, size: ${fileInfo.size}`);

      // 检查文件是否已存在
      if (fs.existsSync(fileInfo.filename)) {
        const stat = fs.statSync(fileInfo.filename);
        if (stat.size === fileInfo.size) {
          // 文件已存在且大小相同，无需接收
          console.log('File already exists, skipping');
          socket.end();
          return;
        } else {
          // 文件已存在但大小不同，需要重新接收
          console.log('File exists but size mismatch, restarting transfer');
        }
      }

      // 创建文件写入流
      receivedData = fs.createWriteStream('./end.txt');
      receivedData.on('error', (err) => {
        console.error(`Error writing to file: ${err.message}`);
        socket.destroy();
      });

      // 开始接收数据
      clients.set(socket, { receivedBytes: 0 });
      socket.write(JSON.stringify({ seq: 0 }));
    } else {
      // 处理客户端发送的数据块
      const packet = JSON.parse(data.toString());
      const blockHash = crypto.createHash('sha256').update(packet.data).digest('hex');
      if (packet.seq !== expectedSeq) {
        console.error(`Expected data block ${expectedSeq}, but got ${packet.seq}`);
        socket.write(JSON.stringify({ seq: expectedSeq - 1 }));
      } else if (blockHash !== packet.hash) {
        console.error(`Data block ${packet.seq} hash mismatch`);
        socket.write(JSON.stringify({ seq: packet.seq }));
      } else {
        console.log(`Received data block ${packet.seq}`);
        receivedData.write(packet.data);
        clients.set(socket, { receivedBytes: clients.get(socket).receivedBytes + packet.data.length });
        expectedSeq += 1;

        // 检查是否需要发送校验请求
        if (clients.get(socket).receivedBytes >= fileInfo.size) {
          socket.write(JSON.stringify({ seq: -1 }));
        } else if (expectedSeq % 10 === 0) {
          socket.write(JSON.stringify({ seq: expectedSeq }));
        }
      }
    }
  });

  // 处理客户端断开连接
  socket.on('close', () => {
    console.log('Client disconnected');
    clients.delete(socket);
  });

  // 处理客户端连接错误
  socket.on('error', (err) => {
    console.error(`Client error: ${err.message}`);
    clients.delete(socket);
  });
});

// 监听端口
server.listen(3000, () => {
  console.log('Server started');
});