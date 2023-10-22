const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);
const AWS = require("aws-sdk");

AWS.config.update({
    region: "us-east-1",
    accessKeyId: "AKIAWJNVNSJEH54IZKNW",
    secretAccessKey: "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",
});

const dynamodb = new AWS.DynamoDB();
const TableName = "chat_data";

let datas = [];

async function loadData() {
    const params = {
        TableName: TableName,
    };

    try {
        const data = await dynamodb.scan(params).promise();
        datas = data.Items.map((item) => AWS.DynamoDB.Converter.unmarshall(item));

        // Sort messages by timestamp in ascending order
        datas.sort((a, b) => {
            const timestampA = new Date(a.timestamp.S);
            const timestampB = new Date(b.timestamp.S);
            return timestampA - timestampB;
        });
    } catch (err) {
        console.error("Error loading data from DynamoDB:", err);
    }
}

async function writeToDynamoDB(data) {
    // Generate a unique message ID based on timestamp and a random portion
    const messageId = (Date.now() + Math.floor(Math.random() * 1000)).toString(); // Convert to string

    const params = {
        TableName: TableName,
        Item: {
            id: { S: messageId }, // Use a string ID
            user: { S: data.user },
            msg: { S: data.msg },
            timestamp: { S: new Date().toISOString() } // Add timestamp
        }
    };

    try {
        await dynamodb.putItem(params).promise();
    } catch (err) {
        console.error("Error writing data to DynamoDB:", err);
    }
}

async function startServer() {
    await loadData(); // Wait for data to be loaded
    server.listen(3000, () => {
        console.log('socket started listening on 3000');
    });
}

startServer(); // Start the server after data is loaded

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/test2.html');
});

app.get('/old', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

io.on('connection', async (socket) => {
    await loadData();
    socket.on('chat id', (ids) => {
        console.log(`New user: ${ids}`);
        datas.sort((a, b) => {
            const timestampA = new Date(a.timestamp);
            const timestampB = new Date(b.timestamp);
            return timestampA - timestampB;
        });
        for (let i = 0; i < datas.length; i++) {
            socket.emit('update', { user: datas[i].user, msg: datas[i].msg, id: datas[i].id });
        }
    });

    socket.on('rm_post', (post) => {
        console.log(`Post: ${post.index} deleted`);
        // Implement removal logic if needed
        // For example: datas.splice(post.index, 1);
    });

    socket.on('event', (usr) => {
        if (usr.msg.includes("!cmd")) {
            if (usr.msg === "!cmd rm") {
                console.log("removing data");
                const deleteParams = {
                    TableName: TableName,
                    Key: {
                        id: { S: usr.id.toString() }
                    }
                };

                dynamodb.deleteItem(deleteParams, (err, data) => {
                    if (err) {
                        console.error("Error deleting data from DynamoDB:", err);
                    } else {
                        console.log("Data removed from DynamoDB");
                    }
                });
            }
        } else {
            // Add timestamp
            const now = new Date();
            const timestamp = now.toISOString(); // Use ISO format for timestamp

            const msgdata = {
                msg: usr.msg,
                user: `${usr.user} ${timestamp}`,
            };
            writeToDynamoDB(msgdata); // Write data to DynamoDB
            io.emit('chat message', { user: `${usr.user} ${timestamp}`, msg: usr.msg, id: msgdata.id });
        }
    });
});
