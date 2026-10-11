/**
 * Owner sign-in and password recovery.
 *
 * There is no registration path, and this app stores no password: the
 * credential lives only in Supabase Auth. Credential failures are reported
 * generically so the screen cannot be used to discover whether an address has
 * an account, while connection/configuration problems are stated plainly because
 * the owner has to be able to tell those two situations apart.
 */

import { el, text, clear } from '../lib/dom.js';
import { assetUrl } from '../lib/config.js';
import { button, field, input, passwordField, busy } from './ui.js';

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function renderLogin(app, { mode = 'signin' } = {}) {
  const isRecover = mode === 'recover';
  const feedback = el('div', { 'aria-live': 'polite', class: 'mh-login__feedback' });
  const status = el('p', { class: 'mh-notice mh-notice--success', hidden: true, role: 'status' });

  const email = input('email', '', {
    type: 'email',
    autocomplete: 'username',
    inputmode: 'email',
    required: true,
    spellcheck: false,
  });
  const password = isRecover ? null : passwordField('password', {
    label: 'Password',
    autocomplete: 'current-password',
  });

  const submit = button(isRecover ? 'Send reset link' : 'Sign in', { variant: 'primary', type: 'submit' });
  const modeToggle = button(isRecover ? 'Back to sign in' : 'Forgot password?', {
    variant: 'ghost',
    size: 'sm',
    onClick: () => app.navigate(isRecover ? '/login' : '/login/recover'),
  });

  const form = el('form', { novalidate: true, class: 'mh-login__form' }, [
    status,
    field({
      label: 'Email address',
      id: 'mh-email',
      hint: 'The address authorised to manage this store.',
      control: email,
      required: true,
    }),
    isRecover
      ? el('p', { class: 'mh-field__hint', style: 'margin-top:-.5rem', text: 'A reset link is sent to this address if it belongs to an owner account. The link opens the dashboard, where you set a new password.' })
      : password,
    feedback,
    submit,
    el('p', { style: 'text-align:center;margin:1rem 0 0' }, [modeToggle]),
  ]);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clear(feedback);
    const data = new FormData(form);
    const address = String(data.get('email') || '').trim();

    if (!EMAIL_PATTERN.test(address)) {
      feedback.appendChild(el('p', { class: 'mh-notice mh-notice--error', role: 'alert', text: 'Enter the email address in the name@example.com format.' }));
      email.focus();
      return;
    }
    const secret = String(data.get('password') || '');
    if (!isRecover && !secret) {
      feedback.appendChild(el('p', { class: 'mh-notice mh-notice--error', role: 'alert', text: 'Enter your password.' }));
      return;
    }

    busy(submit, true, isRecover ? 'Sending…' : 'Signing in…');
    try {
      if (isRecover) {
        await app.api.requestPasswordReset(address);
        status.hidden = false;
        status.textContent =
          'If that address is registered as an owner, a reset link has just been sent. Open it on this device if you can — it works best when you copy the link into the same browser you use for the dashboard.';
        app.navigate('/login');
        return;
      }
      await app.api.signIn({ email: address, password: secret });
      // A successful sign-in is picked up by onAuthStateChange in owner-app.js,
      // which builds the dashboard shell. Nothing here stores the session.
    } catch (error) {
      const node = el('p', { class: 'mh-notice mh-notice--error', role: 'alert' });
      const kind = error?.kind;
      node.appendChild(
        text(
          kind === 'network'
            ? error.message
            : isRecover
              ? 'The reset request could not be completed. Check the connection and try again.'
              : 'Email or password is incorrect, or this account is not authorised to manage the store.',
        ),
      );
      feedback.appendChild(node);
      if (app.api.mode === 'demo') {
        feedback.appendChild(
          el('p', {
            class: 'mh-field__hint',
            text: 'This deployment is in preview mode: the store database is not connected, so sign-in is unavailable. Copy .env.example to .env, add the project URL and publishable key, then run npm run build.',
          }),
        );
      }
    } finally {
      busy(submit, false);
    }
  });

  return el('div', { class: 'mh-login' }, [
    el('div', { class: 'mh-login__card' }, [
      el('img', { class: 'mh-login__mark', src: assetUrl('assets/img/mark.svg'), alt: '', width: '44', height: '44' }),
      el('h1', { text: isRecover ? 'Reset your password' : 'Muna’s Haven' }),
      el('p', {
        class: 'mh-login__sub',
        text: isRecover
          ? 'Enter your email address and a reset link will be sent to it.'
          : 'Owner dashboard — private area',
      }),
      form,
      el('p', {
        class: 'mh-login__private',
        text: 'This area is for the store owner only. Public registration is disabled, and every change is checked against the owner allow-list in the database — not by hiding this page.',
      }),
    ]),
  ]);
}

export function renderWorking(message) {
  return el('div', { class: 'mh-login' }, [
    el('div', { class: 'mh-login__card' }, [
      el('span', { class: 'mh-spinner', style: 'display:block;margin:0 auto 1rem;color:var(--mh-blush-strong)' }),
      el('h1', { text: 'One moment' }),
      el('p', { class: 'mh-login__sub', text: message }),
    ]),
  ]);
}
