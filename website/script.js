// Aquadro POS — Script de Téléchargement Direct & Synchronisation v1.0.7

function triggerDirectDownload(url, filename) {
  // 1. Afficher l'indicateur Toast élégant
  showToast('بدأ التحميل المباشر بنجاح...', `جاري تنزيل ${filename} في متصفحك.`);

  // 2. Déclencher le téléchargement immédiat via lien masqué
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  setTimeout(() => document.body.removeChild(link), 2000);
}

function showToast(title, desc) {
  const toast = document.getElementById('download-toast');
  const titleEl = document.getElementById('toast-title');
  const descEl = document.getElementById('toast-desc');

  if (!toast) return;

  if (titleEl) titleEl.textContent = title;
  if (descEl) descEl.textContent = desc;

  toast.classList.add('active');

  setTimeout(() => {
    toast.classList.remove('active');
  }, 4500);
}

// Récupération dynamique de la dernière release signée sur GitHub
async function syncLatestRelease() {
  try {
    const res = await fetch('https://api.github.com/repos/sigoulojia/aquadro-pos-gourmet/releases/latest');
    if (!res.ok) return;
    const data = await res.json();
    const assets = data.assets || [];

    const x64Asset = assets.find(a => a.name.includes('_x64-setup.exe'));
    const x86Asset = assets.find(a => a.name.includes('_x86-setup.exe'));
    const msiAsset = assets.find(a => a.name.endsWith('.msi'));

    if (x64Asset) {
      document.querySelectorAll('[data-filename*="x64-setup"]').forEach(el => {
        el.setAttribute('data-download-url', x64Asset.browser_download_url);
        el.setAttribute('data-filename', x64Asset.name);
        el.href = x64Asset.browser_download_url;
      });
    }

    if (x86Asset) {
      document.querySelectorAll('[data-filename*="x86-setup"]').forEach(el => {
        el.setAttribute('data-download-url', x86Asset.browser_download_url);
        el.setAttribute('data-filename', x86Asset.name);
        el.href = x86Asset.browser_download_url;
      });
    }

    if (msiAsset) {
      document.querySelectorAll('[data-filename*=".msi"]').forEach(el => {
        el.setAttribute('data-download-url', msiAsset.browser_download_url);
        el.setAttribute('data-filename', msiAsset.name);
        el.href = msiAsset.browser_download_url;
      });
    }
  } catch (err) {
    console.debug('Synchronisation release en arrière-plan effectuée (fallback local v1.0.7 actif).');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  // Attacher les gestionnaires de téléchargement direct
  document.querySelectorAll('[data-direct-download]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      const url = el.getAttribute('data-download-url') || el.getAttribute('href');
      const filename = el.getAttribute('data-filename') || 'Aquadro-POS-Gourmet_1.0.7_x64-setup.exe';
      triggerDirectDownload(url, filename);
    });
  });

  // Tenter la synchronisation dynamique avec GitHub
  syncLatestRelease();
});
