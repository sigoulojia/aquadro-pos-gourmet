// Pizzeria POS Algérie — Assistant IA & Copilote Opérationnel
// Design sobre et chaleureux, requêtes en Arabe Algérien et Français, analyse complète du restaurant

import React, { useState, useRef, useEffect } from 'react';
import { aiService, AIResponse } from '../../services/ai.service';
import { useToast } from '../common/Toast';
import { useI18n } from '../../i18n';
import {
  Bot,
  Send,
  X,
  ShieldCheck,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  TrendingUp,
  CookingPot,
  ShoppingCart,
  DollarSign,
  Truck,
  Lightbulb,
  ClipboardList
} from 'lucide-react';
import { ManagerPinModal } from '../common/ManagerPinModal';

interface MessageItem {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
  proposal?: AIResponse['proposedAction'];
}

interface AIAssistantDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AIAssistantDrawer: React.FC<AIAssistantDrawerProps> = ({
  isOpen,
  onClose
}) => {
  const { isRtl } = useI18n();
  const { showToast } = useToast();
  const [messages, setMessages] = useState<MessageItem[]>([
    {
      id: 'init-msg',
      sender: 'assistant',
      text: `🍕 **مرحباً بك في المساعد الذكي لمتابعة وتسيير البيتزيريا !**\n\nأنا هنا لمساعدتك في أي وقت باللغة العربية أو الفرنسية. يمكنك الضغط على أي سؤال سريع أدناه أو كتابة استفسارك مباشرة :\n\n• **المبيعات اليومية والأرباح**\n• **طاقة الإنتاج (كم بيتزا يمكنك تحضيرها؟)**\n• **نواقص المواد الأولية وقائمة المشتريات**\n• **البيتزا الأكثر طلباً والأكثر ربحية (Food Cost)**\n• **متابعة طلبات التوصيل المنزلي**`,
      timestamp: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [pendingAction, setPendingAction] = useState<AIResponse['proposedAction'] | null>(null);
  const [showManagerPin, setShowManagerPin] = useState(false);
  const [activeCategory, setActiveCategory] = useState<'VENTES' | 'STOCK' | 'RENTABILITE' | 'CONSEILS'>('VENTES');
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  if (!isOpen) return null;

  const handleSend = async (textToSend?: string) => {
    const q = textToSend || input;
    if (!q.trim() || isLoading) return;

    const userMsg: MessageItem = {
      id: `msg-${Date.now()}`,
      sender: 'user',
      text: q.trim(),
      timestamp: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await aiService.query(q);
      const botMsg: MessageItem = {
        id: `ai-${Date.now()}`,
        sender: 'assistant',
        text: response.answer,
        timestamp: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
        proposal: response.proposedAction
      };
      setMessages(prev => [...prev, botMsg]);
    } catch (err: any) {
      showToast(`Erreur IA : ${err.message}`, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleApproveProposal = (proposal: NonNullable<AIResponse['proposedAction']>) => {
    setPendingAction(proposal);
    setShowManagerPin(true);
  };

  const handleConfirmPin = async (managerName: string) => {
    if (!pendingAction) return;

    setShowManagerPin(false);
    try {
      showToast(`Action approuvée par ${managerName}`, 'success');
      setMessages(prev => [
        ...prev,
        {
          id: `executed-${Date.now()}`,
          sender: 'assistant',
          text: `✅ **تمت الموافقة وتطبيق الإجراء على المخزون بواسطة ${managerName} :**\n${pendingAction.description}`,
          timestamp: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
        }
      ]);
      setPendingAction(null);
    } catch (err: any) {
      showToast(`Erreur d'exécution : ${err.message}`, 'error');
    }
  };

  const categorizedPrompts = {
    VENTES: [
      { labelAr: '📊 شحال بعنا اليوم؟', labelFr: 'Recette du jour' },
      { labelAr: '🏆 أكثر البيتزا مبيعاً', labelFr: 'Top pizzas vendues' },
      { labelAr: '🛵 تقرير خدمة التوصيل (Livraison)', labelFr: 'Activité livraison' }
    ],
    STOCK: [
      { labelAr: '🥫 وش راه ناقص فالمواد الأولية؟', labelFr: 'Ingrédients en rupture' },
      { labelAr: '🍕 شحال نقدرو نخدمو بيتزا بالمخزون؟', labelFr: 'Capacité de production' },
      { labelAr: '🛒 قائمة المشتريات المقترحة', labelFr: 'Liste de courses' }
    ],
    RENTABILITE: [
      { labelAr: '💰 البيتزا الأكثر ربحية (Food Cost)', labelFr: 'Rentabilité pizzas' },
      { labelAr: '📝 احتياجات المحل المسجلة من العمال', labelFr: 'Besoins enregistrés' },
      { labelAr: '👨‍💼 تقرير أداء الكاشير والبائعين', labelFr: 'Ventes par caissier' }
    ],
    CONSEILS: [
      { labelAr: '💡 نصائح لتطوير أرباح البيتزيريا', labelFr: 'Conseils rentabilité' },
      { labelAr: '⚡ كيفاش ننظم وقت الذروة (Rush)؟', labelFr: 'Gérer le coup de feu' },
      { labelAr: '📈 كيفاش نزيد مبيعات التوصيل؟', labelFr: 'Booster la livraison' }
    ]
  };

  return (
    <aside
      className={`fixed top-12 bottom-0 ${
        isRtl ? 'left-0 border-r' : 'right-0 border-l'
      } w-full sm:w-[460px] bg-white border-[#E9DCCB] shadow-2xl z-30 flex flex-col select-none text-xs text-stone-800 animate-in slide-in-from-${isRtl ? 'left' : 'right'} duration-200`}
    >
      {/* En-tête */}
      <div className="p-3.5 border-b border-[#E9DCCB] bg-[#FFF8EF] flex items-center justify-between shrink-0">
        <div className="flex items-center space-x-2.5">
          <div className="w-8 h-8 rounded-xl bg-[#E87524] text-white flex items-center justify-center shadow-xs">
            <Bot className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h3 className="font-black text-[#292522] leading-tight text-sm">
                المساعد الذكي للبيتزيريا
              </h3>
              <span className="bg-amber-100 text-[#E87524] text-[10px] font-black px-1.5 py-0.2 rounded-md">
                AI Copilot
              </span>
            </div>
            <span className="text-[10px] text-stone-500 font-medium">
              تحليل مباشر للمبيعات، المخزون، وربحية الأطباق
            </span>
          </div>
        </div>
        <button
          onClick={onClose}
          className="w-7 h-7 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100 flex items-center justify-center transition cursor-pointer"
          title="Fermer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Onglets de catégories de questions rapides */}
      <div className="p-2 border-b border-[#E9DCCB] bg-white shrink-0">
        <div className="grid grid-cols-4 gap-1 p-0.5 bg-stone-100 rounded-xl mb-2">
          <button
            type="button"
            onClick={() => setActiveCategory('VENTES')}
            className={`py-1 px-1.5 rounded-lg text-[10px] font-bold transition flex items-center justify-center gap-1 cursor-pointer ${
              activeCategory === 'VENTES'
                ? 'bg-white text-[#E87524] shadow-xs'
                : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            <TrendingUp className="w-3 h-3" />
            <span>المبيعات</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveCategory('STOCK')}
            className={`py-1 px-1.5 rounded-lg text-[10px] font-bold transition flex items-center justify-center gap-1 cursor-pointer ${
              activeCategory === 'STOCK'
                ? 'bg-white text-[#E87524] shadow-xs'
                : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            <CookingPot className="w-3 h-3" />
            <span>المخزون</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveCategory('RENTABILITE')}
            className={`py-1 px-1.5 rounded-lg text-[10px] font-bold transition flex items-center justify-center gap-1 cursor-pointer ${
              activeCategory === 'RENTABILITE'
                ? 'bg-white text-[#E87524] shadow-xs'
                : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            <DollarSign className="w-3 h-3" />
            <span>الربحية</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveCategory('CONSEILS')}
            className={`py-1 px-1.5 rounded-lg text-[10px] font-bold transition flex items-center justify-center gap-1 cursor-pointer ${
              activeCategory === 'CONSEILS'
                ? 'bg-white text-[#E87524] shadow-xs'
                : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            <Lightbulb className="w-3 h-3" />
            <span>نصائح</span>
          </button>
        </div>

        {/* Boutons de questions de la catégorie active */}
        <div className="flex flex-wrap gap-1.5">
          {categorizedPrompts[activeCategory].map((p, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => handleSend(p.labelAr)}
              className="px-2.5 py-1 bg-[#FCFBF9] hover:bg-[#FFF8EF] text-stone-700 hover:text-[#E87524] border border-[#E9DCCB] hover:border-[#E87524] rounded-lg text-[11px] font-bold transition flex items-center gap-1 cursor-pointer shadow-2xs active:scale-95"
            >
              <span>{p.labelAr}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Liste des messages */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-3.5 bg-[#FAF8F5]">
        {messages.map(m => (
          <div
            key={m.id}
            className={`flex flex-col ${
              m.sender === 'user' ? 'items-end' : 'items-start'
            }`}
          >
            <div
              className={`max-w-[90%] rounded-2xl p-3 text-xs leading-relaxed whitespace-pre-wrap ${
                m.sender === 'user'
                  ? 'bg-[#E87524] text-white font-medium shadow-xs rounded-br-xs'
                  : 'bg-white text-stone-800 border border-[#E9DCCB] shadow-xs rounded-bl-xs'
              }`}
            >
              {m.text}

              {/* Si une proposition d'action sensible est formulée */}
              {m.proposal && (
                <div className="mt-2.5 p-2.5 bg-amber-50 border border-amber-300 rounded-xl text-amber-900">
                  <div className="flex items-center space-x-1.5 font-bold mb-1">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>موافقة المدير مطلوبة (Code PIN)</span>
                  </div>
                  <p className="text-[11px] mb-2">{m.proposal.description}</p>
                  <button
                    onClick={() => handleApproveProposal(m.proposal!)}
                    className="w-full py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold text-[11px] flex items-center justify-center space-x-1 shadow-xs cursor-pointer active:scale-95 transition"
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>تأكيد الإجراء برمز PIN</span>
                  </button>
                </div>
              )}
            </div>
            <span className="text-[9px] text-stone-600 mt-1 px-1 font-mono">{m.timestamp}</span>
          </div>
        ))}

        {isLoading && (
          <div className="flex items-center space-x-2 text-stone-600 text-xs p-2.5 bg-white rounded-xl border border-[#E9DCCB] w-fit shadow-xs">
            <RotateCcw className="w-4 h-4 animate-spin text-[#E87524]" />
            <span>جاري تحليل بيانات البيتزيريا في قاعدة البيانات...</span>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Zone de saisie */}
      <form
        onSubmit={e => {
          e.preventDefault();
          handleSend();
        }}
        className="p-2.5 border-t border-[#E9DCCB] bg-white flex items-center space-x-2 shrink-0"
      >
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="اكتب سؤالك هنا..."
          className="flex-1 px-3 py-2 bg-[#FCFBF9] border border-[#E9DCCB] rounded-xl text-xs text-stone-900 focus:outline-none focus:border-[#E87524] font-medium"
        />
        <button
          type="submit"
          disabled={!input.trim() || isLoading}
          className="p-2.5 bg-[#E87524] hover:bg-[#D3641B] text-white rounded-xl font-bold disabled:opacity-40 flex items-center justify-center shadow-xs cursor-pointer transition active:scale-95"
          title="إرسال"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>

      {/* Modal d'autorisation PIN Responsable */}
      <ManagerPinModal
        isOpen={showManagerPin}
        title="Approbation Déduction Stock"
        description={pendingAction?.description || "Autorisation d'ajustement requise"}
        onSuccess={handleConfirmPin}
        onCancel={() => setShowManagerPin(false)}
      />
    </aside>
  );
};
