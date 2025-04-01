const { MCPClient } = require("./mcp-client");
const readline = require("readline");

class BinanceChatbotHost {
  constructor() {
    // Khởi tạo máy khách MCP để giao tiếp với máy phục vụ
    this.mcpClient = new MCPClient("ws://localhost:3000");

    // Khởi tạo giao diện dòng lệnh để tương tác với người dùng
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
  }

  async start() {
    console.log("🤖 Chào mừng đến với Chatbot Giá Coin Binance!");
    console.log('Nhập câu hỏi về giá coin hoặc gõ "exit" để thoát.\n');

    try {
      // Kết nối máy khách MCP với máy phục vụ
      await this.mcpClient.connect();

      // Bắt đầu vòng lặp chat
      this.promptUser();
    } catch (error) {
      console.error("Lỗi khởi động chatbot:", error.message);
      this.rl.close();
    }
  }

  promptUser() {
    this.rl.question("Bạn: ", async (query) => {
      if (query.toLowerCase() === "exit") {
        console.log("Tạm biệt! Hẹn gặp lại.");
        this.rl.close();
        this.mcpClient.disconnect();
        return;
      }

      try {
        // Xử lý câu hỏi của người dùng
        const response = await this.processUserQuery(query);
        console.log(`Chatbot: ${response}\n`);
      } catch (error) {
        console.error("Lỗi khi xử lý câu hỏi:", error.message);
        console.log(
          "Chatbot: Xin lỗi, tôi không thể xử lý yêu cầu của bạn lúc này. Vui lòng thử lại sau.\n"
        );
      }

      // Tiếp tục vòng lặp
      this.promptUser();
    });
  }

  async processUserQuery(query) {
    // Phân tích câu hỏi của người dùng để xác định xem họ đang hỏi về coin nào
    const coinSymbol = this.extractCoinSymbol(query);

    if (!coinSymbol) {
      return "Xin lỗi, tôi không hiểu bạn đang hỏi về coin nào. Vui lòng thử lại với tên coin cụ thể (ví dụ: Bitcoin, ETH, BNB, v.v.)";
    }

    try {
      // 1. Lấy dữ liệu giá coin từ máy phục vụ MCP thông qua công cụ
      const priceData = await this.mcpClient.callTool("get_coin_price", {
        symbol: coinSymbol,
      });

      // 2. Tạo tin nhắn với ngữ cảnh giá coin
      const messages = [
        {
          role: "user",
          content: {
            type: "text",
            text: query,
          },
        },
      ];

      // 3. Gửi yêu cầu tạo phản hồi từ LLM với dữ liệu ngữ cảnh
      const llmResponse = await this.mcpClient.createMessage(messages, {
        systemPrompt: `Bạn là trợ lý AI chuyên về tiền điện tử. 
        Thông tin mới nhất về ${coinSymbol}: ${JSON.stringify(priceData)}. 
        Trả lời ngắn gọn và thân thiện. Luôn sử dụng dữ liệu giá mới nhất.`,
        modelPreferences: {
          hints: [{ name: "gpt-4" }],
          intelligencePriority: 0.8,
        },
        maxTokens: 200,
      });

      return llmResponse.content.text;
    } catch (error) {
      console.error("Lỗi khi xử lý câu hỏi:", error);
      return `Xin lỗi, tôi không thể lấy thông tin giá cho ${coinSymbol} lúc này. Vui lòng thử lại sau.`;
    }
  }

  extractCoinSymbol(query) {
    // Logic đơn giản để trích xuất symbol coin từ câu hỏi
    const lowercaseQuery = query.toLowerCase();

    // Mapping từ tên coin phổ biến sang symbol
    const coinMapping = {
      bitcoin: "BTC",
      btc: "BTC",
      ethereum: "ETH",
      eth: "ETH",
      binance: "BNB",
      bnb: "BNB",
      solana: "SOL",
      sol: "SOL",
      xrp: "XRP",
      cardano: "ADA",
      ada: "ADA",
      dogecoin: "DOGE",
      doge: "DOGE",
    };

    for (const [name, symbol] of Object.entries(coinMapping)) {
      if (lowercaseQuery.includes(name)) {
        return symbol;
      }
    }

    return null;
  }
}

// Khởi chạy chatbot
const chatbot = new BinanceChatbotHost();
chatbot.start();
