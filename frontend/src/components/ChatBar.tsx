import { useState } from "react";

interface ChatBarProps {
  companyName: string;
  currentSection: string;
}

export function ChatBar({ companyName, currentSection }: ChatBarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<Array<{id: number, text: string, isUser: boolean}>>([]);

  const handleSend = () => {
    if (!message.trim()) return;

    const userMessage = { id: Date.now(), text: message, isUser: true };
    const aiResponse = { 
      id: Date.now() + 1, 
      text: generateAIResponse(message, companyName, currentSection), 
      isUser: false 
    };

    setMessages(prev => [...prev, userMessage, aiResponse]);
    setMessage("");
  };

  const generateAIResponse = (question: string, company: string, section: string): string => {
    const responses = [
      `Great question about ${company}! In the context of ${section}, this metric helps us understand...`,
      `That's an insightful question. For ${company}, this relates to their competitive positioning because...`,
      `Excellent observation! This is particularly relevant for ${company} given their market position in...`,
      `Good thinking! When analyzing ${company}, we should consider how this metric compares to industry peers...`,
      `That's a key insight for equity analysis. For ${company}, this factor is especially important because...`
    ];
    
    return responses[Math.floor(Math.random() * responses.length)];
  };

  return (
    <div className="fixed bottom-4 right-4 z-40">
      {!isOpen ? (
        <button
          onClick={() => setIsOpen(true)}
          className="bg-blue-600 text-white p-4 rounded-full shadow-lg hover:bg-blue-700 transition-colors"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        </button>
      ) : (
        <div className="bg-white rounded-lg shadow-xl border w-80 h-96 flex flex-col">
          <div className="flex justify-between items-center p-4 border-b bg-blue-50 rounded-t-lg">
            <h3 className="font-semibold text-gray-900">AI Assistant</h3>
            <button
              onClick={() => setIsOpen(false)}
              className="text-gray-400 hover:text-gray-600"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 && (
              <div className="text-gray-500 text-sm">
                <p>Ask me anything about {companyName} or equity analysis concepts!</p>
                <div className="mt-2 space-y-1 text-xs">
                  <p>• "What does ROE tell us about Apple?"</p>
                  <p>• "How do I interpret gross margins?"</p>
                  <p>• "What's Apple's competitive advantage?"</p>
                </div>
              </div>
            )}
            
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`p-3 rounded-lg text-sm ${
                  msg.isUser
                    ? "bg-blue-100 text-blue-900 ml-4"
                    : "bg-gray-100 text-gray-800 mr-4"
                }`}
              >
                {msg.text}
              </div>
            ))}
          </div>

          <div className="p-4 border-t">
            <div className="flex gap-2">
              <input
                type="text"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && handleSend()}
                placeholder="Ask about the analysis..."
                className="flex-1 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={handleSend}
                disabled={!message.trim()}
                className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
