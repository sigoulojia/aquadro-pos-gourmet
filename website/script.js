// Aquadro POS — Ultra-Modern Web Engine & Interactive Simulator
// Gère le basculement d'éditions, la démo interactive hero, le simulateur live et le téléchargement direct

let demoMozzarellaStock = 5.76;
const MARGHERITA_CHEESE_PER_PIZZA = 0.12; // 120g par pizza

// 1. Basculement d'éditions (Gourmet / Retail)
function switchEdition(edition) {
  const btnGourmet = document.getElementById('btn-tab-gourmet');
  const btnRetail = document.getElementById('btn-tab-retail');
  const cardGourmet = document.getElementById('card-gourmet-view');
  const cardRetail = document.getElementById('card-retail-view');

  if (edition === 'gourmet') {
    btnGourmet.classList.add('active');
    btnRetail.classList.remove('active');
    cardGourmet.style.opacity = '1';
    cardGourmet.style.transform = 'scale(1.02)';
    cardGourmet.style.borderColor = 'rgba(249, 115, 22, 0.6)';
    cardRetail.style.opacity = '0.75';
    cardRetail.style.transform = 'scale(1)';
    cardRetail.style.borderColor = 'rgba(255, 255, 255, 0.08)';
  } else {
    btnRetail.classList.add('active');
    btnGourmet.classList.remove('active');
    cardRetail.style.opacity = '1';
    cardRetail.style.transform = 'scale(1.02)';
    cardRetail.style.borderColor = 'rgba(59, 130, 246, 0.6)';
    cardGourmet.style.opacity = '0.75';
    cardGourmet.style.transform = 'scale(1)';
    cardGourmet.style.borderColor = 'rgba(255, 255, 255, 0.08)';
  }
}

// 2. Démo Interactive dans le Hero Mockup
function simulateRestock(deltaKg) {
  demoMozzarellaStock = Math.max(0, demoMozzarellaStock + deltaKg);
  updateDemoMockup();
}

function resetDemoStock() {
  demoMozzarellaStock = 5.76;
  updateDemoMockup();
}

function updateDemoMockup() {
  const counterEl = document.getElementById('demo-counter');
  const alertTextEl = document.getElementById('demo-limiting-text');
  const alertBoxEl = document.getElementById('demo-limiting-alert');

  const possiblePizzas = Math.floor(demoMozzarellaStock / MARGHERITA_CHEESE_PER_PIZZA);
  
  if (counterEl) {
    // Animation de compteur
    counterEl.textContent = possiblePizzas;
    counterEl.style.transform = 'scale(1.15)';
    setTimeout(() => {
      counterEl.style.transform = 'scale(1)';
    }, 180);
  }

  if (alertTextEl && alertBoxEl) {
    if (possiblePizzas === 0) {
      alertTextEl.textContent = `RUPTURE DE STOCK : 0 kg de Mozzarella restante — Service bloqué !`;
      alertBoxEl.style.background = 'rgba(239, 68, 68, 0.25)';
      alertBoxEl.style.borderColor = '#EF4444';
    } else {
      alertTextEl.textContent = `Fromage Mozzarella (Reste ${demoMozzarellaStock.toFixed(2)} kg — permet ${possiblePizzas} pizzas)`;
      alertBoxEl.style.background = 'rgba(249, 115, 22, 0.15)';
      alertBoxEl.style.borderColor = 'rgba(249, 115, 22, 0.35)';
    }
  }
}

// 3. Simulateur Live de Rendement (Section Interactive)
function updateLiveSimulator() {
  const flourInput = document.getElementById('slider-flour');
  const cheeseInput = document.getElementById('slider-cheese');
  const sauceInput = document.getElementById('slider-sauce');

  if (!flourInput || !cheeseInput || !sauceInput) return;

  const flourKg = parseFloat(flourInput.value);
  const cheeseKg = parseFloat(cheeseInput.value);
  const sauceKg = parseFloat(sauceInput.value);

  // Mettre à jour les labels
  document.getElementById('val-flour').textContent = `${flourKg} kg`;
  document.getElementById('val-cheese').textContent = `${cheeseKg.toFixed(1)} kg`;
  document.getElementById('val-sauce').textContent = `${sauceKg.toFixed(1)} kg`;

  // Portions requises par pizza :
  // Farine : 0.25 kg
  // Fromage : 0.12 kg
  // Sauce : 0.08 kg
  const pFlour = Math.floor(flourKg / 0.25);
  const pCheese = Math.floor(cheeseKg / 0.12);
  const pSauce = Math.floor(sauceKg / 0.08);

  const maxPortions = Math.min(pFlour, pCheese, pSauce);

  // Déterminer l'ingrédient limitant
  let limitingName = 'Farine Spéciale Pizza';
  let limitingPortions = pFlour;
  if (pCheese < limitingPortions) {
    limitingName = 'Fromage Mozzarella';
    limitingPortions = pCheese;
  }
  if (pSauce < limitingPortions) {
    limitingName = 'Sauce Tomate Italienne';
    limitingPortions = pSauce;
  }

  // Mettre à jour le DOM
  document.getElementById('sim-result-portions').textContent = maxPortions;
  document.getElementById('sim-result-limiting').textContent = `${limitingName} (limite à ${limitingPortions} portions)`;

  // Food cost = (0.25 * 80) + (0.12 * 1100) + (0.08 * 180) = 20 + 132 + 14.4 = 166.4 DA
  const cost = 166.4;
  const sellingPrice = 650;
  const margin = sellingPrice - cost;
  const marginPct = Math.round((margin / sellingPrice) * 100);

  document.getElementById('sim-kpi-cost').textContent = `${cost.toFixed(0)} DA`;
  document.getElementById('sim-kpi-margin').textContent = `${margin.toFixed(0)} DA (${marginPct}%)`;
}

// 4. Copier la commande PowerShell
function copyPowerShellCommand() {
  const code = document.getElementById('ps-cmd')?.textContent || '';
  navigator.clipboard.writeText(code).then(() => {
    const btnText = document.getElementById('copy-btn-text');
    if (btnText) {
      const original = btnText.textContent;
      btnText.textContent = '✓ Copié !';
      btnText.style.color = '#34D399';
      setTimeout(() => {
        btnText.textContent = original;
        btnText.style.color = '';
      }, 2000);
    }
  });
}

// 5. Système de Téléchargement Direct (Sans redirection vers l'interface GitHub)
let currentDownloadInfo = null;

function triggerDirectDownload(url, filename, edition, arch) {
  currentDownloadInfo = { url, filename, edition, arch };

  // 1. Déclencher le téléchargement du binaire dans le navigateur sans quitter la page
  try {
    const hiddenIframe = document.createElement('iframe');
    hiddenIframe.style.display = 'none';
    hiddenIframe.src = url;
    document.body.appendChild(hiddenIframe);
    setTimeout(() => {
      try { hiddenIframe.remove(); } catch (e) {}
    }, 60000);
  } catch (err) {
    console.warn('Iframe download fallback:', err);
  }

  // Ancre de téléchargement directe avec download attribute
  const directLink = document.createElement('a');
  directLink.href = url;
  directLink.setAttribute('download', filename || '');
  directLink.setAttribute('target', '_blank');
  directLink.style.display = 'none';
  document.body.appendChild(directLink);
  directLink.click();
  setTimeout(() => directLink.remove(), 1000);

  // 2. Ouvrir le Centre de Téléchargement Direct & Guide SmartScreen
  openDownloadModal(currentDownloadInfo);
  showDownloadToast(`Téléchargement direct de ${filename} en cours...`);
}

function retryActiveDownload() {
  if (!currentDownloadInfo || !currentDownloadInfo.url) return;
  const directLink = document.createElement('a');
  directLink.href = currentDownloadInfo.url;
  directLink.setAttribute('download', currentDownloadInfo.filename || '');
  directLink.setAttribute('target', '_blank');
  directLink.style.display = 'none';
  document.body.appendChild(directLink);
  directLink.click();
  setTimeout(() => directLink.remove(), 1000);
  showDownloadToast('Nouvelle tentative de téléchargement direct lancée...');
}

function openDownloadModal(data) {
  const modal = document.getElementById('download-modal');
  if (!modal) return;

  const fnEl = document.getElementById('modal-filename-text');
  const metaEl = document.getElementById('modal-filemeta-text');
  const badgeEl = document.getElementById('modal-dl-version');
  const linkX86 = document.getElementById('modal-link-x86');
  const linkMsi = document.getElementById('modal-link-msi');

  if (fnEl) fnEl.textContent = data.filename || 'Aquadro-POS-Gourmet_1.0.3_x64-setup.exe';
  if (metaEl) {
    const isRetail = (data.edition || '').toLowerCase() === 'retail';
    metaEl.textContent = isRetail 
      ? 'Aquadro POS Retail • Windows 10/11 (64-bit) • ~4.5 Mo • SQLite Local'
      : 'Aquadro POS Gourmet v1.0.3 • Windows 10/11 (64-bit) • ~4.5 Mo • SQLite Local';
  }
  if (badgeEl) {
    badgeEl.textContent = data.edition === 'Retail' ? 'Retail v1.0.1 Stable' : 'Gourmet v1.0.3 Stable';
    badgeEl.className = data.edition === 'Retail' ? 'badge badge-retail' : 'badge badge-gourmet';
  }

  // Configurer les liens alternatifs du modal
  if (linkX86) {
    if ((data.edition || '').toLowerCase() === 'retail') {
      linkX86.style.display = 'none';
    } else {
      linkX86.style.display = 'inline-block';
      linkX86.onclick = (e) => {
        e.preventDefault();
        triggerDirectDownload(
          'https://github.com/sigoulojia/aquadro-pos-gourmet/releases/download/v1.0.3/Aquadro-POS-Gourmet_1.0.3_x86-setup.exe',
          'Aquadro-POS-Gourmet_1.0.3_x86-setup.exe',
          'Gourmet',
          'Windows 32-bit (x86)'
        );
      };
    }
  }

  if (linkMsi) {
    linkMsi.style.display = 'inline-block';
    linkMsi.onclick = (e) => {
      e.preventDefault();
      if ((data.edition || '').toLowerCase() === 'retail') {
        triggerDirectDownload(
          'https://github.com/sigoulojia/aquadro-pos/releases/download/v1.0.1/AquadroPOS_1.0.1_x64_en-US.msi',
          'AquadroPOS_1.0.1_x64_en-US.msi',
          'Retail',
          'Package MSI'
        );
      } else {
        triggerDirectDownload(
          'https://github.com/sigoulojia/aquadro-pos-gourmet/releases/download/v1.0.3/Aquadro-POS-Gourmet_1.0.3_x64_en-US.msi',
          'Aquadro-POS-Gourmet_1.0.3_x64_en-US.msi',
          'Gourmet',
          'Package MSI'
        );
      }
    };
  }

  modal.classList.add('active');
  modal.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}

function closeDownloadModal() {
  const modal = document.getElementById('download-modal');
  if (!modal) return;
  modal.classList.remove('active');
  modal.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

function showDownloadToast(text) {
  let toast = document.getElementById('download-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'download-toast';
    toast.className = 'download-toast';
    document.body.appendChild(toast);
  }
  toast.innerHTML = `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#34D399" stroke-width="2.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
    <span>${text}</span>
  `;
  toast.classList.add('active');
  setTimeout(() => {
    toast.classList.remove('active');
  }, 4000);
}

// Initialisation au chargement
document.addEventListener('DOMContentLoaded', () => {
  switchEdition('gourmet');
  updateLiveSimulator();
  updateDemoMockup();

  // Attacher les écouteurs de téléchargement direct
  document.querySelectorAll('[data-direct-download]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      const url = el.getAttribute('data-download-url') || el.getAttribute('href');
      const filename = el.getAttribute('data-filename') || 'Aquadro-POS-Setup.exe';
      const edition = el.getAttribute('data-edition') || 'Gourmet';
      const arch = el.getAttribute('data-arch') || 'Windows 64-bit';
      triggerDirectDownload(url, filename, edition, arch);
    });
  });

  // Touche Échap pour fermer le modal
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeDownloadModal();
    }
  });
});
