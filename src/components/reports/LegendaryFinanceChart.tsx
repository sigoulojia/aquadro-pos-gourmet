// Aquadro POS Algérie V2 — Graphique Financier Avancé & Légendaire (Legendary Finance Chart)
// Offre au commerçant un affichage interactif spectaculaire :
// 1. Courbe Spline Bézier ultra-fluide avec dégradé néon et halos lumineux
// 2. Histogramme (الأعمدة البيانية) avec dégradés 3D, reflets et arrondis modernes
// 3. Mode combiné (الأعمدة + المنحنى) avec infobulles riches et indicateurs de performance

import React, { useState, useMemo } from 'react';
import { CurrencyUtil } from '../../core/currency/currency';
import {
  TrendingUp,
  BarChart3,
  LineChart,
  Layers,
  Sparkles,
  Flame,
  ShoppingBag,
  Zap
} from 'lucide-react';

export interface TimelineDataPoint {
  timeLabel: string;
  orderCount: number;
  revenue: number;
}

interface LegendaryFinanceChartProps {
  timeline: TimelineDataPoint[];
  periodMode: 'TODAY' | 'MONTH' | 'ALL' | string;
}

type ChartType = 'LINE' | 'BAR' | 'COMBO';

export const LegendaryFinanceChart: React.FC<LegendaryFinanceChartProps> = ({
  timeline,
  periodMode
}) => {
  const [chartType, setChartType] = useState<ChartType>('COMBO');
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  // Statistiques clés calculées
  const { totalRevenue, totalOrders, maxRevenue, peakPoint, averageTicket } = useMemo(() => {
    if (!timeline || timeline.length === 0) {
      return { totalRevenue: 0, totalOrders: 0, maxRevenue: 100, peakPoint: null, averageTicket: 0 };
    }
    let totRev = 0;
    let totOrd = 0;
    let maxRev = 0;
    let peak: TimelineDataPoint = timeline[0];

    for (const pt of timeline) {
      totRev += pt.revenue;
      totOrd += pt.orderCount;
      if (pt.revenue > maxRev) {
        maxRev = pt.revenue;
        peak = pt;
      }
    }

    return {
      totalRevenue: totRev,
      totalOrders: totOrd,
      maxRevenue: Math.max(maxRev, 100),
      peakPoint: peak,
      averageTicket: totOrd > 0 ? Math.round(totRev / totOrd) : 0
    };
  }, [timeline]);

  // Dimensions SVG adaptatives
  const svgW = 900;
  const svgH = 260;
  const pLeft = 65;
  const pRight = 35;
  const pTop = 35;
  const pBottom = 45;
  const pW = svgW - pLeft - pRight;
  const pH = svgH - pTop - pBottom;

  // Calcul des coordonnées pour chaque point
  const points = useMemo(() => {
    if (!timeline || timeline.length === 0) return [];
    return timeline.map((pt, i) => {
      const x = timeline.length <= 1
        ? pLeft + pW / 2
        : pLeft + (i / (timeline.length - 1)) * pW;
      const y = pTop + pH - (pt.revenue / maxRevenue) * pH;
      return { x, y, pt, i };
    });
  }, [timeline, maxRevenue, pLeft, pW, pTop, pH]);

  // Génération de la courbe Spline Bézier fluide
  const { splinePath, areaPath } = useMemo(() => {
    if (points.length === 0) return { splinePath: '', areaPath: '' };
    if (points.length === 1) {
      const line = `M ${pLeft},${points[0].y} L ${pLeft + pW},${points[0].y}`;
      return { splinePath: line, areaPath: '' };
    }

    let path = `M ${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`;
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[Math.max(0, i - 1)];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[Math.min(points.length - 1, i + 2)];

      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;

      path += ` C ${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
    }

    const baselineY = pTop + pH;
    const area = `${path} L ${points[points.length - 1].x.toFixed(1)},${baselineY} L ${points[0].x.toFixed(1)},${baselineY} Z`;

    return { splinePath: path, areaPath: area };
  }, [points, pLeft, pW, pTop, pH]);

  // Largeur des barres selon le nombre d'éléments
  const barWidth = useMemo(() => {
    if (points.length <= 1) return 40;
    const available = pW / points.length;
    return Math.max(8, Math.min(36, available * 0.55));
  }, [points.length, pW]);

  if (!timeline || timeline.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-[#E9DCCB] p-8 text-center text-xs text-stone-400 italic">
        لا توجد مبيعات مسجلة في هذه الفترة لعرض المنحنى البياني والأعمدة.
      </div>
    );
  }

  const activePoint = hoveredIndex !== null ? points[hoveredIndex] : null;

  return (
    <div className="bg-white rounded-3xl border border-[#E9DCCB] overflow-hidden shadow-xs space-y-3">
      {/* ========================================================================= */}
      {/* 1. EN-TÊTE : SÉLECTEUR DE STYLE & BADGES STATISTIQUES LÉGENDAIRES          */}
      {/* ========================================================================= */}
      <div className="px-5 py-3.5 bg-gradient-to-r from-[#FFF8EF] to-white border-b border-[#E9DCCB] flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-[#FFF3EB] text-[#E87524] flex items-center justify-center font-bold">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-black text-[#292522] text-sm flex items-center gap-2">
                <span>المنحنى البياني ومخطط الأعمدة المالي (Performance & Ventes)</span>
                <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                  مباشر
                </span>
              </h3>
              <p className="text-[11px] text-stone-500">
                {periodMode === 'TODAY'
                  ? 'متابعة حركة المبيعات وتدفق الزبائن ساعة بساعة طيلة اليوم'
                  : periodMode === 'MONTH'
                  ? 'تطور المبيعات يوماً بيوم خلال الشهر الحالي'
                  : 'السجل التراكمي الشامل لكافة فترات العمل'}
              </p>
            </div>
          </div>
        </div>

        {/* Contrôles du Graphique : Switcher (Ligne, Barres, Combiné) */}
        <div className="flex flex-wrap items-center gap-1.5 bg-[#FFF3EB]/60 p-1 rounded-2xl border border-[#E9DCCB]">
          <button
            type="button"
            onClick={() => setChartType('COMBO')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              chartType === 'COMBO'
                ? 'bg-[#E87524] text-white shadow-xs'
                : 'text-stone-600 hover:text-[#292522]'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>عرض مدمج (أعمدة + منحنى)</span>
          </button>

          <button
            type="button"
            onClick={() => setChartType('BAR')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              chartType === 'BAR'
                ? 'bg-[#E87524] text-white shadow-xs'
                : 'text-stone-600 hover:text-[#292522]'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span>أعمدة بيانية فقط</span>
          </button>

          <button
            type="button"
            onClick={() => setChartType('LINE')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              chartType === 'LINE'
                ? 'bg-[#E87524] text-white shadow-xs'
                : 'text-stone-600 hover:text-[#292522]'
            }`}
          >
            <LineChart className="w-3.5 h-3.5" />
            <span>منحنى انسيابي فقط</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. RUBAN DES STATS CLÉS (CHIPS RENTABILITÉ)                               */}
      {/* ========================================================================= */}
      <div className="px-5 pt-1 grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="p-2.5 rounded-2xl bg-stone-50 border border-stone-200/80 flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-orange-100 text-[#E87524] flex items-center justify-center shrink-0">
            <Flame className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[10px] text-stone-500 font-bold">ذروة المبيعات (Pic)</div>
            <div className="text-xs font-black text-stone-900 font-mono">
              {peakPoint ? `${peakPoint.timeLabel} (${CurrencyUtil.formatDZD(peakPoint.revenue)})` : '-'}
            </div>
          </div>
        </div>

        <div className="p-2.5 rounded-2xl bg-stone-50 border border-stone-200/80 flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
            <TrendingUp className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[10px] text-stone-500 font-bold">إجمالي المبيعات</div>
            <div className="text-xs font-black text-emerald-800 font-mono">
              {CurrencyUtil.formatDZD(totalRevenue)}
            </div>
          </div>
        </div>

        <div className="p-2.5 rounded-2xl bg-stone-50 border border-stone-200/80 flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
            <ShoppingBag className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[10px] text-stone-500 font-bold">عدد الطلبات</div>
            <div className="text-xs font-black text-stone-900 font-mono">
              {totalOrders} طلب
            </div>
          </div>
        </div>

        <div className="p-2.5 rounded-2xl bg-stone-50 border border-stone-200/80 flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center shrink-0">
            <Zap className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[10px] text-stone-500 font-bold">متوسط السلة (Panier)</div>
            <div className="text-xs font-black text-stone-900 font-mono">
              {CurrencyUtil.formatDZD(averageTicket)}
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3. BANNIÈRE INFOBULLE DYNAMIQUE LORS DU SURVOL D'UN CRÉNEAU                */}
      {/* ========================================================================= */}
      <div className="px-5">
        <div className={`p-2.5 rounded-2xl transition-all duration-150 flex items-center justify-between text-xs font-bold border ${
          activePoint
            ? 'bg-amber-500/10 border-[#E87524]/40 text-[#292522]'
            : 'bg-stone-50 border-stone-200/70 text-stone-500'
        }`}>
          {activePoint ? (
            <>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#E87524] animate-ping" />
                <span>
                  الفترة / الوقت : <strong className="text-[#E87524] font-black">{activePoint.pt.timeLabel}</strong>
                </span>
              </div>
              <div className="flex items-center gap-4">
                <span>
                  المبيعات : <strong className="text-stone-900 font-mono font-black">{CurrencyUtil.formatDZD(activePoint.pt.revenue)}</strong>
                </span>
                <span className="text-stone-600 font-mono">
                  {activePoint.pt.orderCount} طلب
                </span>
                <span className="bg-[#E87524] text-white px-2 py-0.5 rounded-lg text-[10px] font-mono">
                  {totalRevenue > 0 ? `${((activePoint.pt.revenue / totalRevenue) * 100).toFixed(1)}%` : '0%'}
                </span>
              </div>
            </>
          ) : (
            <div className="text-center w-full text-[11px] text-stone-400">
              💡 مرر الفأرة فوق أي عمود أو نقطة للاطلاع على التفاصيل الدقيقة لذلك الوقت
            </div>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 4. ZONE DE RENDU SVG HAUTE DÉFINITION (LE GRAPHIQUE LÉGENDAIRE)           */}
      {/* ========================================================================= */}
      <div className="px-4 pb-4">
        <div className="w-full overflow-x-auto">
          <svg
            viewBox={`0 0 ${svgW} ${svgH}`}
            className="w-full h-56 select-none"
            style={{ minWidth: '600px' }}
          >
            <defs>
              {/* Dégradé courbe spline néon */}
              <linearGradient id="legendarySplineGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#E87524" stopOpacity="0.45" />
                <stop offset="60%" stopColor="#FF9F43" stopOpacity="0.12" />
                <stop offset="100%" stopColor="#E87524" stopOpacity="0.0" />
              </linearGradient>

              {/* Dégradé barres 3D chaleureuses */}
              <linearGradient id="legendaryBarGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#FFA048" />
                <stop offset="100%" stopColor="#E87524" />
              </linearGradient>

              {/* Dégradé barre sélectionnée */}
              <linearGradient id="legendaryBarHoverGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#FF6B00" />
                <stop offset="100%" stopColor="#C45100" />
              </linearGradient>

              {/* Filtre Halo Lumineux Néon */}
              <filter id="neonGlow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
            </defs>

            {/* Lignes de repère horizontales avec montants en DZD */}
            {[0, 0.25, 0.5, 0.75, 1].map((ratio, idx) => {
              const yPos = pTop + pH * (1 - ratio);
              const valDzd = Math.round(maxRevenue * ratio);
              return (
                <g key={idx}>
                  <line
                    x1={pLeft}
                    y1={yPos}
                    x2={svgW - pRight}
                    y2={yPos}
                    stroke="#F1E7DB"
                    strokeDasharray="4 4"
                    strokeWidth="1.2"
                  />
                  <text
                    x={pLeft - 10}
                    y={yPos + 3.5}
                    textAnchor="end"
                    fontSize="9.5"
                    fill="#8C827A"
                    fontFamily="monospace"
                    fontWeight="600"
                  >
                    {valDzd >= 1000 ? `${Math.round(valDzd / 1000)}k` : valDzd}
                  </text>
                </g>
              );
            })}

            {/* Ligne de base au sol */}
            <line
              x1={pLeft}
              y1={pTop + pH}
              x2={svgW - pRight}
              y2={pTop + pH}
              stroke="#D8C7B5"
              strokeWidth="1.5"
            />

            {/* =================================================================== */}
            {/* 4.A RENDU DES COLONNES / BARRES (SI MODE BAR OU COMBO)             */}
            {/* =================================================================== */}
            {(chartType === 'BAR' || chartType === 'COMBO') &&
              points.map((p, idx) => {
                const isHovered = hoveredIndex === idx;
                const barH = Math.max(2, (p.pt.revenue / maxRevenue) * pH);
                const barX = p.x - barWidth / 2;
                const barY = pTop + pH - barH;

                return (
                  <g
                    key={`bar-${idx}`}
                    className="cursor-pointer transition-all duration-150"
                    onMouseEnter={() => setHoveredIndex(idx)}
                    onMouseLeave={() => setHoveredIndex(null)}
                  >
                    {/* Rectangle de colonne avec arrondis élégants */}
                    <rect
                      x={barX}
                      y={barY}
                      width={barWidth}
                      height={barH}
                      rx={Math.min(6, barWidth / 2)}
                      ry={Math.min(6, barWidth / 2)}
                      fill={isHovered ? 'url(#legendaryBarHoverGrad)' : 'url(#legendaryBarGrad)'}
                      opacity={chartType === 'COMBO' ? (isHovered ? 1 : 0.75) : (isHovered ? 1 : 0.88)}
                      filter={isHovered ? 'url(#neonGlow)' : undefined}
                      className="transition-all"
                    />

                    {/* Reflet lumineux blanc sur le sommet de la barre */}
                    {barH > 8 && (
                      <line
                        x1={barX + 2}
                        y1={barY + 1}
                        x2={barX + barWidth - 2}
                        y2={barY + 1}
                        stroke="#FFFFFF"
                        strokeWidth="1.5"
                        strokeOpacity="0.6"
                      />
                    )}
                  </g>
                );
              })}

            {/* =================================================================== */}
            {/* 4.B RENDU DE LA COURBE SPLINE (SI MODE LINE OU COMBO)               */}
            {/* =================================================================== */}
            {(chartType === 'LINE' || chartType === 'COMBO') && (
              <>
                {/* Surface dégradée sous la courbe */}
                {areaPath && (
                  <path
                    d={areaPath}
                    fill="url(#legendarySplineGrad)"
                    className="transition-opacity duration-200"
                  />
                )}

                {/* Trait de la courbe Spline avec lueur */}
                {splinePath && (
                  <path
                    d={splinePath}
                    fill="none"
                    stroke="#D46317"
                    strokeWidth="3.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    filter="url(#neonGlow)"
                  />
                )}
              </>
            )}

            {/* =================================================================== */}
            {/* 4.C POINTS INTERACTIFS, AXE X & SURVOL                             */}
            {/* =================================================================== */}
            {points.map((p, idx) => {
              const isHovered = hoveredIndex === idx;
              return (
                <g
                  key={`pt-${idx}`}
                  className="cursor-pointer"
                  onMouseEnter={() => setHoveredIndex(idx)}
                  onMouseLeave={() => setHoveredIndex(null)}
                >
                  {/* Ligne verticale de repère lors du survol */}
                  {isHovered && (
                    <line
                      x1={p.x}
                      y1={pTop}
                      x2={p.x}
                      y2={pTop + pH}
                      stroke="#E87524"
                      strokeWidth="1.5"
                      strokeDasharray="3 3"
                      strokeOpacity="0.75"
                    />
                  )}

                  {/* Nœud circulaire sur la courbe */}
                  {(chartType === 'LINE' || chartType === 'COMBO' || isHovered) && (
                    <>
                      {/* Anneau de halo lors du survol */}
                      {isHovered && (
                        <circle
                          cx={p.x}
                          cy={p.y}
                          r="10"
                          fill="none"
                          stroke="#E87524"
                          strokeWidth="2.5"
                          strokeOpacity="0.4"
                        />
                      )}
                      <circle
                        cx={p.x}
                        cy={p.y}
                        r={isHovered ? 6 : 3.8}
                        fill={isHovered ? '#C45100' : '#FFFFFF'}
                        stroke="#E87524"
                        strokeWidth={isHovered ? '2.5' : '2'}
                        className="transition-all"
                      />
                    </>
                  )}

                  {/* Étiquette Axe X (Heure ou Date) */}
                  <text
                    x={p.x}
                    y={svgH - 12}
                    textAnchor="middle"
                    fontSize="9.5"
                    fill={isHovered ? '#E87524' : '#6B7280'}
                    fontWeight={isHovered ? 'bold' : 'normal'}
                    fontFamily="monospace"
                  >
                    {p.pt.timeLabel}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      </div>
    </div>
  );
};
