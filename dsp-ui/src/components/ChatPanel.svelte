<script>
  import { tick } from 'svelte'
  import { token } from '../lib/stores.js'
  import { chat } from '../lib/aiChat.js'

  const API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY
  const OPENAI_KEY = import.meta.env.VITE_OPENAI_API_KEY

  let isOpen = false
  let inputText = ''
  let isLoading = false
  let statusText = ''
  let messagesEl

  // Separate display messages (for UI) and full API history (includes tool use/result blocks)
  let displayMessages = []
  let apiHistory = []

  async function sendMessage() {
    const text = inputText.trim()
    if (!text || isLoading || !API_KEY) return

    displayMessages = [...displayMessages, { role: 'user', text }]
    apiHistory = [...apiHistory, { role: 'user', content: text }]
    inputText = ''
    isLoading = true
    statusText = 'Думаю...'

    await tick()
    scrollToBottom()

    try {
      const { answer, history } = await chat(apiHistory, {
        anthropicKey: API_KEY,
        openaiKey: OPENAI_KEY,
        apiToken: $token,
        onStatus: (s) => { statusText = s }
      })
      apiHistory = history
      displayMessages = [...displayMessages, { role: 'assistant', text: answer }]
    } catch (err) {
      displayMessages = [...displayMessages, { role: 'assistant', text: `Ошибка: ${err.message}`, error: true }]
    } finally {
      isLoading = false
      statusText = ''
      await tick()
      scrollToBottom()
    }
  }

  function scrollToBottom() {
    if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight
  }

  function onKeydown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  function clearHistory() {
    displayMessages = []
    apiHistory = []
  }

  function useExample(q) {
    inputText = q
  }
</script>

<!-- Floating trigger button -->
<button
  class="chat-fab"
  class:active={isOpen}
  on:click={() => (isOpen = !isOpen)}
  title="ИИ-ассистент"
  aria-label="Открыть ИИ-ассистент"
>
  {#if isOpen}
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M2 2l14 14M16 2L2 16" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
    </svg>
  {:else}
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
      <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12z"/>
      <circle cx="8" cy="10" r="1.2"/><circle cx="12" cy="10" r="1.2"/><circle cx="16" cy="10" r="1.2"/>
    </svg>
  {/if}
</button>

<!-- Chat panel -->
{#if isOpen}
  <div class="chat-panel" role="dialog" aria-label="ИИ-ассистент">
    <div class="chat-header">
      <div class="header-title">
        <span class="ai-badge">AI</span>
        <span>Ассистент</span>
      </div>
      {#if displayMessages.length > 0}
        <button class="icon-btn" on:click={clearHistory} title="Очистить историю">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
            <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
      {/if}
    </div>

    <div class="messages-container" bind:this={messagesEl}>
      {#if !API_KEY}
        <div class="hint-block">
          <p>Для работы ассистента добавьте ключ в файл <code>.env.local</code>:</p>
          <code class="code-block">VITE_ANTHROPIC_API_KEY=sk-ant-...</code>
        </div>
      {:else if displayMessages.length === 0}
        <div class="hint-block">
          <p class="hint-title">Спросите что угодно о кампаниях</p>
          <div class="examples">
            <button class="example-chip" on:click={() => useExample('Сколько денег потратили на бренд Nike в апреле?')}>
              Расходы по бренду за месяц
            </button>
            <button class="example-chip" on:click={() => useExample('Сколько активных кампаний сейчас?')}>
              Активные кампании
            </button>
            <button class="example-chip" on:click={() => useExample('Покажи все бренды и рекламодателей')}>
              Список брендов
            </button>
            <button class="example-chip" on:click={() => useExample('Какой суммарный плановый бюджет всех активных кампаний?')}>
              Суммарный бюджет
            </button>
          </div>
        </div>
      {/if}

      {#each displayMessages as msg}
        <div class="message {msg.role}" class:error-msg={msg.error}>
          {msg.text}
        </div>
      {/each}

      {#if isLoading}
        <div class="message assistant loading-msg">
          <span class="dots"><span>.</span><span>.</span><span>.</span></span>
          {#if statusText}
            <span class="status-label">{statusText}</span>
          {/if}
        </div>
      {/if}
    </div>

    <div class="input-row">
      <textarea
        bind:value={inputText}
        on:keydown={onKeydown}
        placeholder="Задайте вопрос..."
        rows="2"
        disabled={isLoading || !API_KEY}
      ></textarea>
      <button
        class="send-btn"
        on:click={sendMessage}
        disabled={isLoading || !inputText.trim() || !API_KEY}
        title="Отправить (Enter)"
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
          <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
        </svg>
      </button>
    </div>
  </div>
{/if}

<style>
  .chat-fab {
    position: fixed;
    bottom: 24px;
    right: 24px;
    width: 52px;
    height: 52px;
    border-radius: 50%;
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, #7c3aed, #4f46e5);
    color: #fff;
    box-shadow: 0 4px 16px rgba(124, 58, 237, 0.45);
    transition: transform 0.18s, box-shadow 0.18s;
    z-index: 1000;
  }
  .chat-fab:hover {
    transform: scale(1.08);
    box-shadow: 0 6px 22px rgba(124, 58, 237, 0.55);
  }
  .chat-fab.active {
    background: linear-gradient(135deg, #5b21b6, #3730a3);
  }

  .chat-panel {
    position: fixed;
    bottom: 88px;
    right: 24px;
    width: 380px;
    height: 520px;
    background: #16162a;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 16px;
    display: flex;
    flex-direction: column;
    box-shadow: 0 12px 48px rgba(0, 0, 0, 0.5);
    z-index: 999;
    overflow: hidden;
    animation: panel-in 0.18s ease;
  }
  @keyframes panel-in {
    from { opacity: 0; transform: translateY(10px) scale(0.98); }
    to   { opacity: 1; transform: translateY(0)   scale(1); }
  }

  .chat-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    background: rgba(124, 58, 237, 0.12);
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    flex-shrink: 0;
  }
  .header-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    font-weight: 600;
    color: #e2e8f0;
  }
  .ai-badge {
    background: linear-gradient(135deg, #7c3aed, #4f46e5);
    color: #fff;
    font-size: 10px;
    font-weight: 700;
    padding: 2px 6px;
    border-radius: 4px;
    letter-spacing: 0.5px;
  }
  .icon-btn {
    background: none;
    border: none;
    color: #64748b;
    cursor: pointer;
    padding: 4px;
    border-radius: 6px;
    display: flex;
    align-items: center;
    transition: color 0.15s, background 0.15s;
  }
  .icon-btn:hover {
    color: #e2e8f0;
    background: rgba(255, 255, 255, 0.06);
  }

  .messages-container {
    flex: 1;
    overflow-y: auto;
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    scrollbar-width: thin;
    scrollbar-color: rgba(255, 255, 255, 0.08) transparent;
  }

  .hint-block {
    color: #94a3b8;
    font-size: 13px;
    line-height: 1.6;
    margin: auto 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .hint-title {
    font-size: 13px;
    color: #cbd5e1;
    font-weight: 500;
    margin: 0;
  }
  .hint-block p { margin: 0; }
  .hint-block code {
    background: rgba(255, 255, 255, 0.06);
    padding: 4px 8px;
    border-radius: 5px;
    font-size: 11px;
    color: #a78bfa;
    font-family: monospace;
  }
  .code-block {
    display: block;
    padding: 8px 12px !important;
    margin-top: 4px;
  }
  .examples {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .example-chip {
    background: rgba(124, 58, 237, 0.1);
    border: 1px solid rgba(124, 58, 237, 0.22);
    color: #a78bfa;
    border-radius: 8px;
    padding: 7px 11px;
    font-size: 12px;
    cursor: pointer;
    text-align: left;
    transition: background 0.15s, border-color 0.15s;
    font-family: inherit;
    line-height: 1.4;
  }
  .example-chip:hover {
    background: rgba(124, 58, 237, 0.2);
    border-color: rgba(124, 58, 237, 0.4);
  }

  .message {
    max-width: 88%;
    padding: 9px 13px;
    border-radius: 12px;
    font-size: 13px;
    line-height: 1.65;
    white-space: pre-wrap;
    word-break: break-word;
  }
  .message.user {
    align-self: flex-end;
    background: linear-gradient(135deg, #7c3aed, #4f46e5);
    color: #fff;
    border-bottom-right-radius: 3px;
  }
  .message.assistant {
    align-self: flex-start;
    background: rgba(255, 255, 255, 0.06);
    color: #e2e8f0;
    border-bottom-left-radius: 3px;
  }
  .message.error-msg {
    background: rgba(239, 68, 68, 0.12) !important;
    color: #fca5a5 !important;
  }

  .loading-msg {
    display: flex;
    align-items: center;
    gap: 8px;
    color: #64748b !important;
    background: rgba(255, 255, 255, 0.03) !important;
  }
  .dots {
    display: inline-flex;
    gap: 2px;
  }
  .dots span {
    font-size: 18px;
    line-height: 0.8;
    animation: dot-blink 1.2s infinite;
  }
  .dots span:nth-child(2) { animation-delay: 0.2s; }
  .dots span:nth-child(3) { animation-delay: 0.4s; }
  @keyframes dot-blink {
    0%, 80%, 100% { opacity: 0.2; }
    40%            { opacity: 1; }
  }
  .status-label {
    font-size: 12px;
    color: #94a3b8;
  }

  .input-row {
    display: flex;
    align-items: flex-end;
    gap: 8px;
    padding: 10px 12px;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
    flex-shrink: 0;
  }
  .input-row textarea {
    flex: 1;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 10px;
    color: #e2e8f0;
    font-size: 13px;
    padding: 8px 11px;
    resize: none;
    font-family: inherit;
    line-height: 1.5;
    transition: border-color 0.15s;
    min-height: 0;
  }
  .input-row textarea:focus {
    outline: none;
    border-color: rgba(124, 58, 237, 0.5);
  }
  .input-row textarea::placeholder { color: #475569; }
  .input-row textarea:disabled { opacity: 0.45; }

  .send-btn {
    width: 36px;
    height: 36px;
    border-radius: 10px;
    border: none;
    cursor: pointer;
    background: linear-gradient(135deg, #7c3aed, #4f46e5);
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: opacity 0.15s, transform 0.15s;
  }
  .send-btn:disabled { opacity: 0.35; cursor: not-allowed; }
  .send-btn:not(:disabled):hover { transform: scale(1.06); }
</style>
