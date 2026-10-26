import { supabase } from './supabase-client.js';
import { supabaseConfig } from './supabase-config.js';

const panel = document.querySelector('#chat-panel');
const launcher = document.querySelector('#chat-launcher');
const closeButton = document.querySelector('#chat-close');
const chatLog = document.querySelector('#chat-log');
const chatForm = document.querySelector('#chat-form');
const chatInput = document.querySelector('#chat-input');
const chatSubmit = chatForm.querySelector('button[type="submit"]');
const chatStatus = document.querySelector('#chat-status');
const handoffToggle = document.querySelector('#chat-handoff-toggle');
const handoffForm = document.querySelector('#chat-handoff');
const handoffStatus = document.querySelector('#chat-handoff-status');
const maxTurns = 8;
const maxInquiryMessageLength = 3000;
const transcript = [];
let captchaWidgetId = null;

function showStatus(element, message, kind = '') {
    element.textContent = message;
    element.dataset.kind = kind;
}

function addMessage(text, speaker) {
    const message = document.createElement('p');
    message.className = `chat-message chat-message-${speaker}`;
    message.textContent = text;
    chatLog.append(message);
    chatLog.scrollTop = chatLog.scrollHeight;
}

function addTranscriptMessage(role, text) {
    transcript.push({ role, content: text });
}

function hasContactDetails(text) {
    const emailPattern = /\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/i;
    const phonePattern = /(?:\+?\d[\d\s().-]{7,}\d)/;
    return emailPattern.test(text) || phonePattern.test(text);
}

function setChatBusy(isBusy) {
    chatInput.disabled = isBusy;
    chatSubmit.disabled = isBusy;
    chatSubmit.textContent = isBusy ? '…' : 'Send';
}

if (!supabase || supabaseConfig.turnstileSiteKey.startsWith('YOUR_')) {
    chatInput.disabled = true;
    chatSubmit.disabled = true;
    showStatus(chatStatus, 'Chat is unavailable until Supabase, the site-chat function, and anti-abuse verification are configured.', 'error');
} else {
    chatInput.disabled = true;
    chatSubmit.disabled = true;
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.defer = true;
    script.addEventListener('load', () => {
        if (!window.turnstile) {
            showStatus(chatStatus, 'Anti-abuse verification could not start. Please use the inquiry form.', 'error');
            return;
        }
        captchaWidgetId = window.turnstile.render('#chat-turnstile', {
            sitekey: supabaseConfig.turnstileSiteKey
        });
        chatInput.disabled = false;
        chatSubmit.disabled = false;
    });
    script.addEventListener('error', () => {
        showStatus(chatStatus, 'Anti-abuse verification could not load. Please use the inquiry form.', 'error');
    });
    document.head.append(script);
}

function openChat() {
    panel.hidden = false;
    launcher.setAttribute('aria-expanded', 'true');
    chatInput.focus();
}

function closeChat() {
    panel.hidden = true;
    launcher.setAttribute('aria-expanded', 'false');
    launcher.focus();
}

launcher.addEventListener('click', () => {
    if (panel.hidden) {
        openChat();
    } else {
        closeChat();
    }
});

closeButton.addEventListener('click', closeChat);

document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !panel.hidden) {
        closeChat();
    }
});

handoffToggle.addEventListener('click', () => {
    handoffForm.hidden = !handoffForm.hidden;
    if (!handoffForm.hidden) {
        handoffForm.querySelector('input[name="name"]').focus();
    }
});

chatForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const question = chatInput.value.trim();
    if (!question || !supabase) {
        return;
    }
    const turnstileToken = captchaWidgetId === null
        ? ''
        : window.turnstile?.getResponse(captchaWidgetId) ?? '';
    if (!turnstileToken) {
        showStatus(chatStatus, 'Complete the anti-abuse check before sending your question.', 'error');
        return;
    }

    if (transcript.filter((entry) => entry.startsWith('Visitor:')).length >= maxTurns) {
        showStatus(chatStatus, 'This chat has reached its limit. Ask our team to continue.');
        handoffForm.hidden = false;
        return;
    }

    addMessage(question, 'visitor');
    addTranscriptMessage('user', question);
    chatInput.value = '';

    if (hasContactDetails(question)) {
        const response = 'For your privacy, I did not send that message to the AI assistant. Please use “Ask our team” to share contact details securely.';
        addMessage(response, 'assistant');
        addTranscriptMessage('assistant', response);
        handoffForm.hidden = false;
        showStatus(chatStatus, 'Contact details detected; the message was not sent to Gemini.');
        return;
    }

    setChatBusy(true);
    showStatus(chatStatus, 'Thinking…');

    try {
        const { data, error } = await supabase.functions.invoke('site-chat', {
            body: {
                messages: transcript.slice(-maxTurns * 2),
                turnstileToken
            }
        });
        if (error) throw error;
        const response = data?.reply?.trim();
        if (!response) {
            throw new Error('The AI assistant returned an empty response.');
        }
        addMessage(response, 'assistant');
        addTranscriptMessage('assistant', response);
        showStatus(chatStatus, '');
    } catch (error) {
        console.error('The AI assistant could not answer the visitor.', error);
        const response = 'Sorry, I could not answer just now. You can send your question to our team using “Ask our team.”';
        addMessage(response, 'assistant');
        addTranscriptMessage('Assistant', response);
        showStatus(chatStatus, 'The AI service is unavailable. Your question was not sent to our team.', 'error');
    } finally {
        if (captchaWidgetId !== null) window.turnstile?.reset(captchaWidgetId);
        setChatBusy(false);
        chatInput.focus();
    }
});

handoffForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    showStatus(handoffStatus, '');

    if (!handoffForm.reportValidity()) {
        return;
    }

    if (!supabase) {
        showStatus(handoffStatus, 'Project inquiries are not configured yet. Please try again later.', 'error');
        return;
    }

    const fields = handoffForm.elements;
    const visitorMessages = transcript.filter((entry) => entry.role === 'user');
    const projectDetails = fields.projectDetails.value.trim();
    if (visitorMessages.length === 0 && projectDetails.length < 20) {
        showStatus(handoffStatus, 'Please add project details or ask a question before sending.', 'error');
        return;
    }

    const header = 'AI chat follow-up request';
    const details = projectDetails ? `Project details: ${projectDetails}` : '';
    const transcriptLimit = maxInquiryMessageLength - header.length - details.length - 4;
    const conversation = transcript
        .map((entry) => `${entry.role === 'user' ? 'Visitor' : 'Assistant'}: ${entry.content}`)
        .join('\n\n')
        .slice(-Math.max(0, transcriptLimit));
    const message = [header, details, conversation].filter(Boolean).join('\n\n').slice(0, maxInquiryMessageLength);
    const submitButton = handoffForm.querySelector('button[type="submit"]');
    submitButton.disabled = true;

    try {
        const { error } = await supabase.from('inquiries').insert({
            name: fields.name.value.trim(),
            email: fields.email.value.trim(),
            company: '',
            service: fields.service.value,
            timeline: '',
            message: message.length >= 20 ? message : 'Please follow up about my project inquiry.'
        });
        if (error) throw error;
        handoffForm.reset();
        handoffForm.hidden = true;
        showStatus(handoffStatus, '');
        showStatus(chatStatus, 'Your chat was sent to our team. Thank you!', 'success');
        addMessage('Thanks—your conversation has been sent to our team for follow-up.', 'assistant');
    } catch (error) {
        console.error('Could not send the chat follow-up request.', error);
        showStatus(handoffStatus, 'We could not send your request. Please try the project inquiry form instead.', 'error');
    } finally {
        submitButton.disabled = false;
    }
});
