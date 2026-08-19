const passwordResetRequestForm = document.createElement('form');
passwordResetRequestForm.id = 'passwordResetRequestForm';
passwordResetRequestForm.className = 'hidden';
passwordResetRequestForm.innerHTML = `
  <h2>Recuperar senha</h2>
  <p class="password-reset-help">Informe seu e-mail. Se houver uma conta, enviaremos um link válido por 20 minutos.</p>
  <label>E-mail<input id="passwordResetEmail" type="email" autocomplete="email" required></label>
  <button type="submit">Enviar link de recuperação ✉️</button>
  <button class="demo-link" type="button" data-password-reset-back>Voltar para entrar</button>
  <small id="passwordResetRequestMessage" role="status"></small>`;

const passwordResetConfirmForm = document.createElement('form');
passwordResetConfirmForm.id = 'passwordResetConfirmForm';
passwordResetConfirmForm.className = 'hidden';
passwordResetConfirmForm.innerHTML = `
  <h2>Criar nova senha</h2>
  <p class="password-reset-help">Use pelo menos 10 caracteres.</p>
  <input id="passwordResetToken" type="hidden">
  <label>Nova senha<input id="passwordResetPassword" type="password" autocomplete="new-password" minlength="10" maxlength="128" required></label>
  <label>Confirmar senha<input id="passwordResetConfirmation" type="password" autocomplete="new-password" minlength="10" maxlength="128" required></label>
  <button type="submit">Atualizar senha 🔐</button>
  <button class="demo-link" type="button" data-password-reset-back>Voltar para entrar</button>
  <small id="passwordResetConfirmMessage" role="status"></small>`;

const passwordResetLoginCard = document.querySelector('.login-card');
passwordResetLoginCard.append(passwordResetRequestForm, passwordResetConfirmForm);

const forgotPasswordButton = document.createElement('button');
forgotPasswordButton.type = 'button';
forgotPasswordButton.id = 'forgotPasswordButton';
forgotPasswordButton.className = 'demo-link';
forgotPasswordButton.textContent = 'Esqueci minha senha';
document.querySelector('#demoButton').before(forgotPasswordButton);

const passwordResetTabs = document.querySelector('.auth-tabs');
const passwordResetPanels = [loginForm, registerForm, passwordResetRequestForm, passwordResetConfirmForm];

function showPasswordResetPanel(panel) {
  passwordResetPanels.forEach(item => item.classList.toggle('hidden', item !== panel));
  passwordResetTabs.classList.toggle('hidden', panel === passwordResetConfirmForm);
}

async function passwordResetRequest(path, payload) {
  const response = await fetch(`https://gfp-familiar-api.onrender.com${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Não foi possível concluir a operação.');
  return data;
}

forgotPasswordButton.addEventListener('click', () => {
  document.querySelector('#passwordResetEmail').value = document.querySelector('#loginEmail').value;
  showPasswordResetPanel(passwordResetRequestForm);
  document.querySelector('#passwordResetEmail').focus();
});

document.querySelectorAll('[data-auth-tab]').forEach(button => button.addEventListener('click', () => {
  passwordResetRequestForm.classList.add('hidden');
  passwordResetConfirmForm.classList.add('hidden');
  passwordResetTabs.classList.remove('hidden');
}));

document.querySelectorAll('[data-password-reset-back]').forEach(button => button.addEventListener('click', () => {
  showPasswordResetPanel(loginForm);
  passwordResetTabs.classList.remove('hidden');
  document.querySelector('[data-auth-tab="login"]').click();
}));

passwordResetRequestForm.addEventListener('submit', async event => {
  event.preventDefault();
  const message = document.querySelector('#passwordResetRequestMessage');
  const submit = passwordResetRequestForm.querySelector('button[type="submit"]');
  submit.disabled = true;
  message.textContent = '🟡 Preparando recuperação...';
  try {
    const data = await passwordResetRequest('/auth/password-reset/request', {
      email: document.querySelector('#passwordResetEmail').value
    });
    message.textContent = `🟢 ${data.message}`;
    if (data.previewUrl) {
      const preview = document.createElement('a');
      preview.href = data.previewUrl;
      preview.textContent = 'Abrir link de homologação';
      preview.className = 'password-reset-preview';
      message.after(preview);
    }
  } catch (error) {
    message.textContent = `🔴 ${error.message}`;
  } finally {
    submit.disabled = false;
  }
});

passwordResetConfirmForm.addEventListener('submit', async event => {
  event.preventDefault();
  const message = document.querySelector('#passwordResetConfirmMessage');
  const password = document.querySelector('#passwordResetPassword').value;
  const confirmation = document.querySelector('#passwordResetConfirmation').value;
  if (password !== confirmation) {
    message.textContent = '🔴 As senhas não coincidem.';
    return;
  }

  const submit = passwordResetConfirmForm.querySelector('button[type="submit"]');
  submit.disabled = true;
  message.textContent = '🟡 Atualizando senha...';
  try {
    const data = await passwordResetRequest('/auth/password-reset/confirm', {
      token: document.querySelector('#passwordResetToken').value,
      password
    });
    message.textContent = `🟢 ${data.message}`;
    const url = new URL(window.location.href);
    url.searchParams.delete('resetToken');
    window.history.replaceState({}, '', url);
    passwordResetConfirmForm.reset();
    setTimeout(() => {
      showPasswordResetPanel(loginForm);
      passwordResetTabs.classList.remove('hidden');
      document.querySelector('[data-auth-tab="login"]').click();
      authMessage.textContent = '🟢 Senha atualizada. Entre com sua nova senha.';
    }, 1200);
  } catch (error) {
    message.textContent = `🔴 ${error.message}`;
  } finally {
    submit.disabled = false;
  }
});

const passwordResetToken = new URLSearchParams(window.location.search).get('resetToken');
if (passwordResetToken) {
  document.querySelector('#passwordResetToken').value = passwordResetToken;
  showPasswordResetPanel(passwordResetConfirmForm);
  document.querySelector('#passwordResetPassword').focus();
}
