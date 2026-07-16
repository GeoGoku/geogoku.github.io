const menuButton = document.querySelector('.menu-toggle');
const navLinks = document.querySelector('.nav-links');

if (menuButton && navLinks) {
  menuButton.addEventListener('click', () => {
    const open = navLinks.classList.toggle('open');
    menuButton.setAttribute('aria-expanded', String(open));
  });
}

document.querySelectorAll('.nav-links a').forEach(link => {
  link.addEventListener('click', () => {
    navLinks?.classList.remove('open');
    menuButton?.setAttribute('aria-expanded', 'false');
  });
});

const contactDialog = document.createElement('div');
contactDialog.className = 'contact-dialog';
contactDialog.hidden = true;
contactDialog.innerHTML = `
  <div class="contact-dialog-backdrop" data-close-contact></div>
  <section class="contact-dialog-card" role="dialog" aria-modal="true" aria-labelledby="contact-title">
    <button class="contact-close" type="button" aria-label="关闭联系窗口" data-close-contact>×</button>
    <h2 id="contact-title">联系陈涛老师</h2>
    <p>请选择打开邮件客户端，或复制邮箱地址后在常用邮箱中发送。</p>
    <span class="contact-address"></span>
    <div class="contact-subject" hidden></div>
    <div class="contact-actions">
      <a class="button contact-open" href="#">打开邮件客户端</a>
      <button class="button contact-copy" type="button">复制邮箱地址</button>
    </div>
    <p class="contact-status" role="status" aria-live="polite"></p>
  </section>`;
document.body.appendChild(contactDialog);

let activeEmail = '';
const closeContact = () => {
  contactDialog.hidden = true;
  document.body.style.overflow = '';
};
const openContact = href => {
  const value = href.replace(/^mailto:/i, '');
  const parts = value.split('?');
  activeEmail = decodeURIComponent(parts[0]);
  const params = new URLSearchParams(parts[1] || '');
  const subject = params.get('subject');
  contactDialog.querySelector('.contact-address').textContent = activeEmail;
  const subjectBox = contactDialog.querySelector('.contact-subject');
  subjectBox.textContent = subject ? '建议邮件标题：' + subject : '';
  subjectBox.hidden = !subject;
  contactDialog.querySelector('.contact-open').href = href;
  contactDialog.querySelector('.contact-status').textContent = '';
  contactDialog.hidden = false;
  document.body.style.overflow = 'hidden';
  contactDialog.querySelector('.contact-open').focus();
};

document.addEventListener('click', event => {
  const mailLink = event.target.closest('a[href^="mailto:"]');
  if (mailLink && !mailLink.closest('.contact-dialog')) {
    event.preventDefault();
    openContact(mailLink.getAttribute('href'));
    return;
  }
  if (event.target.closest('[data-close-contact]')) closeContact();
});

contactDialog.querySelector('.contact-copy').addEventListener('click', async () => {
  const status = contactDialog.querySelector('.contact-status');
  try {
    await navigator.clipboard.writeText(activeEmail);
    status.textContent = '邮箱地址已复制。';
  } catch {
    const input = document.createElement('textarea');
    input.value = activeEmail;
    document.body.appendChild(input);
    input.select();
    document.execCommand('copy');
    input.remove();
    status.textContent = '邮箱地址已复制。';
  }
});

document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !contactDialog.hidden) closeContact();
});
