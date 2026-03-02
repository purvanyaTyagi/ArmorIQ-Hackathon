import { useState } from 'react';
import './PromptPage.css';

function PromptPage() {
    const [messages, setMessages] = useState([
        {
            id: 1,
            type: 'assistant',
            text: 'Hello! I\'m your AI inventory assistant. How can I help you manage your inventory today?',
            timestamp: new Date()
        }
    ]);
    const [inputValue, setInputValue] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!inputValue.trim() || isLoading) return;

        // Add user message
        const userMessage = {
            id: messages.length + 1,
            type: 'user',
            text: inputValue,
            timestamp: new Date()
        };

        setMessages(prev => [...prev, userMessage]);
        setInputValue('');
        setIsLoading(true);

        try {
            const response = await fetch('http://localhost:8000/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ message: userMessage.text }),
            });

            const data = await response.json();

            const aiMessage = {
                id: messages.length + 2,
                type: 'assistant',
                text: data.response || "Sorry, I couldn't process that.",
                timestamp: new Date()
            };
            setMessages(prev => [...prev, aiMessage]);
        } catch (error) {
            console.error('Chat error:', error);
            const errorMessage = {
                id: messages.length + 2,
                type: 'assistant',
                text: "Error communicating with the inventory assistant.",
                timestamp: new Date()
            };
            setMessages(prev => [...prev, errorMessage]);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="prompt-page">
            <div className="page-header">
                <h1>AI Assistant</h1>
                <p className="text-secondary">Get intelligent insights and predictions for your inventory</p>
            </div>

            <div className="chat-container card-glass">
                <div className="messages-area">
                    {messages.map((message) => (
                        <div
                            key={message.id}
                            className={`message ${message.type === 'user' ? 'message-user' : 'message-assistant'}`}
                        >
                            <div className="message-avatar">
                                {message.type === 'user' ? '👤' : '🤖'}
                            </div>
                            <div className="message-content">
                                <div className="message-text">{message.text}</div>
                                <div className="message-time">
                                    {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </div>
                            </div>
                        </div>
                    ))}

                    {isLoading && (
                        <div className="message message-assistant">
                            <div className="message-avatar">🤖</div>
                            <div className="message-content">
                                <div className="typing-indicator">
                                    <span></span>
                                    <span></span>
                                    <span></span>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <form onSubmit={handleSubmit} className="input-area">
                    <input
                        type="text"
                        className="input"
                        placeholder="Ask about inventory predictions, stock levels, or recommendations..."
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                    />
                    <button type="submit" className="btn btn-primary" disabled={!inputValue.trim()}>
                        <span>Send</span>
                        <span>✈️</span>
                    </button>
                </form>
            </div>


        </div>
    );
}

export default PromptPage;
