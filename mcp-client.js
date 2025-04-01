const WebSocket = require("ws");
const { v4: uuidv4 } = require("uuid");

class MCPClient {
  constructor(serverUrl) {
    this.serverUrl = serverUrl;
    this.ws = null;
    this.pendingRequests = new Map();
    this.initialized = false;
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.serverUrl);

      this.ws.on("open", async () => {
        console.log("Kết nối đến máy phục vụ MCP thành công");

        try {
          // Khởi tạo giao thức MCP
          await this.initialize();
          console.log("Khởi tạo giao thức MCP thành công");
          resolve();
        } catch (error) {
          reject(error);
        }
      });

      this.ws.on("message", (data) => {
        this.handleMessage(data);
      });

      this.ws.on("error", (error) => {
        console.error("Lỗi kết nối MCP:", error);
        reject(error);
      });

      this.ws.on("close", () => {
        console.log("Kết nối MCP đã đóng");
      });
    });
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
    }
  }

  async handleMessage(data) {
    try {
      console.log(
        "Nhận phản hồi từ máy phục vụ:",
        data.toString().substring(0, 150) + "..."
      );
      const message = JSON.parse(data);

      // Xử lý phản hồi từ máy phục vụ
      if (message.id && this.pendingRequests.has(message.id)) {
        const { resolve, reject } = this.pendingRequests.get(message.id);

        if (message.error) {
          console.error("Lỗi từ máy phục vụ:", message.error);
          reject(new Error(message.error.message));
        } else {
          console.log(`Nhận phản hồi thành công cho yêu cầu ID: ${message.id}`);
          resolve(message.result);
        }

        this.pendingRequests.delete(message.id);
      } else if (message.id) {
        console.warn(`Nhận phản hồi cho ID không tồn tại: ${message.id}`);
      } else {
        console.log("Nhận thông báo không có ID:", message);
      }
    } catch (error) {
      console.error("Lỗi xử lý tin nhắn:", error);
    }
  }

  async sendRequest(method, params = {}) {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error("Kết nối WebSocket chưa mở"));
        return;
      }

      const id = uuidv4();
      const request = {
        jsonrpc: "2.0",
        id,
        method,
        params,
      };

      console.log(`Gửi yêu cầu ${method} với ID: ${id}`);
      this.pendingRequests.set(id, { resolve, reject });

      try {
        this.ws.send(JSON.stringify(request));
        console.log(`Đã gửi yêu cầu ${method}`);
      } catch (error) {
        console.error(`Lỗi khi gửi yêu cầu ${method}:`, error);
        this.pendingRequests.delete(id);
        reject(error);
      }

      // Thêm timeout để tránh request bị treo vô hạn
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          console.warn(`Yêu cầu ${method} với ID ${id} đã quá thời gian chờ`);
          this.pendingRequests.delete(id);
          reject(new Error(`Yêu cầu ${method} đã hết thời gian chờ`));
        }
      }, 10000); // 10 giây timeout
    });
  }

  // Phương thức để gửi thông báo (không cần phản hồi)
  sendNotification(method, params = {}) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.error("Không thể gửi thông báo: Kết nối WebSocket chưa mở");
      return;
    }

    const notification = {
      jsonrpc: "2.0",
      method,
      params,
    };

    console.log(`Gửi thông báo ${method}`);

    try {
      this.ws.send(JSON.stringify(notification));
      console.log(`Đã gửi thông báo ${method}`);
    } catch (error) {
      console.error(`Lỗi khi gửi thông báo ${method}:`, error);
    }
  }

  async initialize() {
    const initParams = {
      protocolVersion: "2024-11-05",
      capabilities: {
        roots: { listChanged: true },
        sampling: {},
        tools: {},
        prompts: { listChanged: true },
      },
      clientInfo: {
        name: "BinanceCoinChatbot",
        version: "1.0.0",
      },
    };

    const result = await this.sendRequest("initialize", initParams);

    // Hoàn thành khởi tạo - Đây là một thông báo, không phải yêu cầu
    this.sendNotification("initialized");

    this.initialized = true;
    return result;
  }

  async listTools() {
    if (!this.initialized) {
      throw new Error("Client chưa được khởi tạo");
    }

    return this.sendRequest("tools/list");
  }

  async callTool(name, toolArgs = {}) {
    if (!this.initialized) {
      throw new Error("Client chưa được khởi tạo");
    }

    return this.sendRequest("tools/call", { name, arguments: toolArgs });
  }

  async createMessage(messages, options = {}) {
    if (!this.initialized) {
      throw new Error("Client chưa được khởi tạo");
    }

    const params = {
      messages,
      ...options,
    };

    return this.sendRequest("sampling/createMessage", params);
  }
}

module.exports = { MCPClient };
