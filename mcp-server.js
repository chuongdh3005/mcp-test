const WebSocket = require("ws");
const http = require("http");
const axios = require("axios");

class BinanceMCPServer {
  constructor(port = 3000) {
    this.port = port;
    this.clients = new Set();

    // Khởi tạo máy chủ HTTP và WebSocket
    this.server = http.createServer();
    this.wss = new WebSocket.Server({ server: this.server });

    // Định nghĩa các công cụ được hỗ trợ
    this.tools = [
      {
        name: "get_coin_price",
        description: "Lấy giá hiện tại của một coin từ Binance",
        arguments: [
          {
            name: "symbol",
            description: "Ký hiệu của coin (BTC, ETH, v.v.)",
            required: true,
          },
        ],
      },
    ];

    // Định nghĩa các prompt được hỗ trợ
    this.prompts = [
      {
        name: "coin_price_analysis",
        description: "Phân tích giá của một coin",
        arguments: [
          {
            name: "symbol",
            description: "Ký hiệu của coin",
            required: true,
          },
          {
            name: "price_data",
            description: "Dữ liệu giá",
            required: true,
          },
        ],
      },
    ];
  }

  start() {
    try {
      this.setupWebSocketHandlers();

      this.server.listen(this.port, () => {
        console.log(`Máy phục vụ MCP Binance đang chạy tại port ${this.port}`);
      });

      this.server.on("error", (error) => {
        console.error("Lỗi khi khởi động máy chủ:", error.message);
        if (error.code === "EADDRINUSE") {
          console.error(
            `Port ${this.port} đã được sử dụng. Vui lòng chọn port khác.`
          );
        }
      });
    } catch (error) {
      console.error("Lỗi không xác định khi khởi động máy chủ:", error);
    }
  }

  setupWebSocketHandlers() {
    this.wss.on("connection", (ws) => {
      console.log("Client mới kết nối");
      this.clients.add(ws);

      ws.on("message", async (message) => {
        console.log(
          "Nhận tin nhắn từ client:",
          message.toString().substring(0, 150) + "..."
        );

        try {
          const request = JSON.parse(message);
          console.log(`Xử lý yêu cầu: ${request.method}`);

          const response = await this.handleRequest(request);

          if (response) {
            console.log(
              `Gửi phản hồi cho yêu cầu ${request.method}:`,
              JSON.stringify(response).substring(0, 150) + "..."
            );
            ws.send(JSON.stringify(response));
          } else {
            console.log(`Không có phản hồi cho yêu cầu ${request.method}`);
          }
        } catch (error) {
          console.error("Lỗi xử lý tin nhắn:", error);

          // Gửi phản hồi lỗi nếu có ID
          if (request && request.id) {
            const errorResponse = {
              jsonrpc: "2.0",
              id: request.id,
              error: {
                code: -32603,
                message: `Lỗi máy phục vụ nội bộ: ${error.message}`,
              },
            };
            console.log("Gửi phản hồi lỗi:", JSON.stringify(errorResponse));
            ws.send(JSON.stringify(errorResponse));
          }
        }
      });

      ws.on("close", () => {
        console.log("Client ngắt kết nối");
        this.clients.delete(ws);
      });

      ws.on("error", (error) => {
        console.error("Lỗi WebSocket:", error);
      });
    });
  }

  async handleRequest(request) {
    const { jsonrpc, id, method, params } = request;

    if (jsonrpc !== "2.0") {
      return {
        jsonrpc: "2.0",
        id,
        error: {
          code: -32600,
          message: "Yêu cầu JSON-RPC không hợp lệ",
        },
      };
    }

    // Xử lý các phương thức MCP
    switch (method) {
      case "initialize":
        return this.handleInitialize(id, params);

      case "initialized":
        return null; // Không cần phản hồi

      case "tools/list":
        return this.handleToolsList(id, params);

      case "tools/call":
        return await this.handleToolsCall(id, params);

      case "prompts/list":
        return this.handlePromptsList(id, params);

      case "prompts/get":
        return this.handlePromptsGet(id, params);

      case "sampling/createMessage":
        return await this.handleCreateMessage(id, params);

      default:
        return {
          jsonrpc: "2.0",
          id,
          error: {
            code: -32601,
            message: `Phương thức không được hỗ trợ: ${method}`,
          },
        };
    }
  }

  handleInitialize(id, params) {
    // Xác minh phiên bản giao thức
    if (params.protocolVersion !== "2024-11-05") {
      return {
        jsonrpc: "2.0",
        id,
        error: {
          code: -32600,
          message: "Phiên bản giao thức không được hỗ trợ",
        },
      };
    }

    // Phản hồi với thông tin và khả năng của máy phục vụ
    return {
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: "2024-11-05",
        capabilities: {
          prompts: { listChanged: true },
          tools: { callChanged: true },
          sampling: {},
        },
        serverInfo: {
          name: "BinanceMCPServer",
          version: "1.0.0",
        },
      },
    };
  }

  handleToolsList(id, params) {
    return {
      jsonrpc: "2.0",
      id,
      result: {
        tools: this.tools,
        nextCursor: null,
      },
    };
  }

  async handleToolsCall(id, params) {
    const { name, arguments: toolArgs } = params;

    if (name === "get_coin_price") {
      try {
        // Kiểm tra tham số bắt buộc
        if (!toolArgs.symbol) {
          throw new Error("Thiếu tham số symbol");
        }

        // Chuẩn hóa symbol
        const symbol = toolArgs.symbol.toUpperCase();
        const tradingPair = symbol + "USDT";

        // Gọi API Binance để lấy giá
        const response = await axios.get(
          "https://api.binance.com/api/v3/ticker/price",
          {
            params: { symbol: tradingPair },
          }
        );

        // Định dạng lại kết quả
        const result = {
          symbol,
          price: parseFloat(response.data.price),
          tradingPair: response.data.symbol,
          timestamp: new Date().toISOString(),
          currency: "USDT",
        };

        return {
          jsonrpc: "2.0",
          id,
          result,
        };
      } catch (error) {
        // Xử lý lỗi đặc biệt từ Binance (coin không tồn tại, v.v.)
        if (error.response && error.response.status === 400) {
          return {
            jsonrpc: "2.0",
            id,
            error: {
              code: -32602,
              message: `Coin không hợp lệ hoặc không có trên Binance: ${toolArgs.symbol}`,
            },
          };
        }

        // Lỗi khác
        return {
          jsonrpc: "2.0",
          id,
          error: {
            code: -32603,
            message: `Lỗi lấy giá coin: ${error.message}`,
          },
        };
      }
    }

    // Công cụ không được hỗ trợ
    return {
      jsonrpc: "2.0",
      id,
      error: {
        code: -32601,
        message: `Công cụ không được hỗ trợ: ${name}`,
      },
    };
  }

  handlePromptsList(id, params) {
    return {
      jsonrpc: "2.0",
      id,
      result: {
        prompts: this.prompts,
        nextCursor: null,
      },
    };
  }

  handlePromptsGet(id, params) {
    const { name, arguments: promptArgs } = params;

    if (name === "coin_price_analysis") {
      // Kiểm tra tham số bắt buộc
      if (!promptArgs.symbol || !promptArgs.price_data) {
        return {
          jsonrpc: "2.0",
          id,
          error: {
            code: -32602,
            message: "Thiếu tham số bắt buộc",
          },
        };
      }

      // Tạo prompt phân tích giá coin
      return {
        jsonrpc: "2.0",
        id,
        result: {
          description: "Phân tích giá coin",
          messages: [
            {
              role: "user",
              content: {
                type: "text",
                text: `Hãy phân tích giá hiện tại của ${
                  promptArgs.symbol
                } dựa trên dữ liệu sau: ${JSON.stringify(
                  promptArgs.price_data
                )}`,
              },
            },
          ],
        },
      };
    }

    // Prompt không được hỗ trợ
    return {
      jsonrpc: "2.0",
      id,
      error: {
        code: -32601,
        message: `Prompt không được hỗ trợ: ${name}`,
      },
    };
  }

  async handleCreateMessage(id, params) {
    const { messages, systemPrompt, modelPreferences, maxTokens } = params;

    // Trong một triển khai thực tế, chúng ta sẽ gọi API của LLM thực sự (như OpenAI)
    // Ở đây, chúng ta giả lập việc tạo phản hồi LLM

    try {
      // Trích xuất nội dung prompt từ tin nhắn
      const userMessage = messages.find((msg) => msg.role === "user");
      const userQuery = userMessage?.content?.text || "";

      // Trích xuất thông tin về coin từ systemPrompt (trong triển khai thực tế)
      const coinSymbolMatch = systemPrompt.match(
        /Thông tin mới nhất về ([A-Z]+):/
      );
      const coinSymbol = coinSymbolMatch
        ? coinSymbolMatch[1]
        : "không xác định";

      // Trích xuất thông tin giá từ systemPrompt
      const priceDataMatch = systemPrompt.match(/\{.*\}/);

      let priceResponse = "Không có thông tin giá.";

      if (priceDataMatch) {
        try {
          const priceData = JSON.parse(priceDataMatch[0]);

          // Tạo phản hồi dựa trên dữ liệu giá
          if (priceData.price) {
            priceResponse = `Giá ${coinSymbol} hiện tại là ${priceData.price} ${
              priceData.currency || "USDT"
            }.`;
          }
        } catch (error) {
          console.error("Lỗi phân tích dữ liệu giá:", error);
        }
      }

      // Giả lập phản hồi LLM dựa trên dữ liệu
      const responseText = `${priceResponse} Dữ liệu được cập nhật vào ${new Date().toLocaleTimeString()}.`;

      return {
        jsonrpc: "2.0",
        id,
        result: {
          role: "assistant",
          content: { type: "text", text: responseText },
          model: modelPreferences?.hints?.[0]?.name || "default-model",
          stopReason: "endTurn",
        },
      };
    } catch (error) {
      return {
        jsonrpc: "2.0",
        id,
        error: {
          code: -32603,
          message: `Lỗi tạo tin nhắn: ${error.message}`,
        },
      };
    }
  }
}

// Khởi chạy máy phục vụ
console.log("Đang khởi động máy phục vụ MCP Binance...");
const server = new BinanceMCPServer();
server.start();
console.log("Đã gọi phương thức start() cho máy phục vụ");
