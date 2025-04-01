main();
const { MCPClient } = require("./mcp-client");

// Phiên bản đơn giản hơn của host để debug
async function main() {
  console.log("🔍 Bắt đầu chương trình debug...");

  // Khởi tạo máy khách MCP
  const mcpClient = new MCPClient("ws://localhost:3000");

  try {
    console.log("Đang kết nối với máy phục vụ MCP...");
    await mcpClient.connect();
    console.log("Kết nối thành công, đã khởi tạo giao thức");

    // Tạm dừng để đảm bảo khởi tạo hoàn tất
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Liệt kê công cụ
    console.log("Đang lấy danh sách công cụ...");
    const toolsResult = await mcpClient.listTools();
    console.log("Danh sách công cụ:", JSON.stringify(toolsResult, null, 2));

    // Gọi công cụ để lấy giá Bitcoin
    console.log("Đang lấy giá Bitcoin...");
    const btcPrice = await mcpClient.callTool("get_coin_price", {
      symbol: "BTC",
    });
    console.log("Kết quả giá Bitcoin:", JSON.stringify(btcPrice, null, 2));

    // Tạo tin nhắn đơn giản
    console.log("Đang tạo tin nhắn với LLM...");
    const messages = [
      {
        role: "user",
        content: { type: "text", text: "Giá Bitcoin hiện tại là bao nhiêu?" },
      },
    ];

    const llmResponse = await mcpClient.createMessage(messages, {
      systemPrompt: `Bạn là trợ lý AI chuyên về tiền điện tử. 
      Thông tin mới nhất về BTC: ${JSON.stringify(btcPrice)}. 
      Trả lời ngắn gọn và thân thiện.`,
      modelPreferences: {
        hints: [{ name: "gpt-4" }],
        intelligencePriority: 0.8,
      },
      maxTokens: 200,
    });

    console.log("Phản hồi từ LLM:", JSON.stringify(llmResponse, null, 2));

    // Đóng kết nối
    mcpClient.disconnect();
    console.log("Đã đóng kết nối. Debug hoàn tất.");
  } catch (error) {
    console.error("Lỗi trong quá trình debug:", error);
  }
}

// Chạy hàm main
main();
