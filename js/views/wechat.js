// Full-screen guide shown instead of the app inside WeChat's in-app browser, which can neither
// download nor share files: points at WeChat's ··· menu to open the page in the system browser.

import { copyText, h, setChildren, toast } from '../dom.js';
import { t } from '../i18n.js';
import { isIOS } from '../install.js';

export function renderWeChatGuide(container) {
  setChildren(
    container,
    h('div', { class: 'wechat-arrow', 'aria-hidden': 'true' }, '↗'),
    h(
      'section',
      { class: 'wechat-guide' },
      h('h2', {}, t('wechat.title')),
      h(
        'ol',
        { class: 'wechat-steps' },
        h('li', {}, t('wechat.step1')),
        h('li', {}, t(isIOS() ? 'wechat.step2Ios' : 'wechat.step2')),
      ),
      h('p', { class: 'muted small' }, t('wechat.reason')),
      h('p', { class: 'muted small' }, t('wechat.installTip')),
      h(
        'button',
        {
          type: 'button',
          class: 'btn block',
          onClick: async () => {
            if (await copyText(location.href)) toast(t('wechat.copied'));
          },
        },
        t('wechat.copyLink'),
      ),
    ),
  );
}
