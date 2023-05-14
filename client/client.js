const fs = require('fs');
const net = require('net');
const crypto = require('crypto');

// 要传输的文件
const filePath = './start.txt';

// 计算文件的哈希值
const hash = crypto.createHash('sha256');
const stream = fs.createReadStream(filePath);
stream.on('data', (data) => hash.update(data));
stream.on('end', () => {
  const fileHash = hash.digest('hex');
  console.log(`File hash: ${fileHash}`);

  // 连接服务端
  const client = net.connect({ host: 'localhost', port: 3000 }, () => {
    console.log('Connected to server');

    // 发送文件信息
    const fileInfo = { filename: 'start.txt', size: fs.statSync(filePath).size, hash: fileHash };
    client.write(JSON.stringify(fileInfo));

    // 分块发送文件数据
    const blockSize = 1024 * 1024; // 1MB
    const buffer = Buffer.alloc(blockSize);
    let offset = 0;
    let seq = 0;

    const readAndSend = () => {
      fs.createReadStream(filePath, { start: offset, end: offset + blockSize - 1 })
        .on('data', (data) => {
          // 计算数据块的哈希值
          const blockHash = crypto.createHash('sha256').update(data).digest('hex');

          // 发送数据块和哈希值
          const packet = { seq, data, hash: blockHash };
          client.write(JSON.stringify(packet));
          offset += data.length;
          seq += 1;
        })
        .on('end', () => {
          console.log('File transfer complete');
          client.end();
        })
        .on('error', (err) => {
          console.error(`Error reading file: ${err.message}`);
          client.destroy();
        });
    };

    // 监听服务端的校验请求
    client.on('data', (data) => {
      const packet = JSON.parse(data.toString());
      const blockHash = crypto.createHash('sha256').update(packet.data).digest('hex');
      if (blockHash !== packet.hash) {
        console.error(`Data block ${packet.seq} hash mismatch`);
        client.write(JSON.stringify({ seq: packet.seq }));
      } else {
        console.log(`Data block ${packet.seq} verified`);
        if (packet.seq === seq) {
          readAndSend();
        }
      }
    });

    // 开始发送数据
    readAndSend();
  });

  // 处理连接错误
  client.on('error', (err) => {
    console.error(`Error connecting to server: ${err.message}`);
  });

  // 处理连接关闭
  client.on('close', () => {
    console.log('Connection closed');
  });
});

// 处理文件读取错误
stream.on('error', (err) => {
  console.error(`Error reading file: ${err.message}`);
});