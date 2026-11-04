/**
 * Style strony głównej (makieta „verris.pl — rozbudowa treści”, 1.11.2026, plansza Main). Trzymane w module TS
 * i wstawiane przez <style href precedence> w page.tsx, bo testy jest renderują stronę bez obsługi importów .css.
 * Wszystkie klasy mają prefiks gl-, żeby nie zderzyć się z globals.css ani ze stylami innych stron.
 * Animacje tylko przy prefers-reduced-motion: no-preference.
 */
export const STYL_GLOWNEJ = `
.gl-sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
.gl-hero{padding:40px 0 48px}
.gl-hero-grid{position:relative;display:grid;gap:36px;align-items:center}
.gl-hero h1{font-size:clamp(36px,5.2vw,54px);line-height:1.06;letter-spacing:-.03em;margin:14px 0 0}
.gl-hero .lead{font-size:17px;line-height:1.6;margin-top:16px;max-width:620px}
.gl-punkty{list-style:none;margin:20px 0 0;padding:0;display:grid;gap:10px;color:var(--paper)}
.gl-punkty li{display:flex;gap:10px;align-items:flex-start}
.gl-ok{color:var(--mint);font-weight:700;flex:none}
.gl-cta{display:flex;gap:12px;flex-wrap:wrap;margin-top:24px}
.gl-drobne{font-size:14px;color:var(--stone);margin-top:14px}
@media(min-width:1024px){.gl-hero{padding:64px 0 64px}.gl-hero-grid{grid-template-columns:minmax(0,5fr) minmax(0,6fr);gap:56px}}

/* podgląd w hero */
.gl-podglad{background:var(--pine);border:1px solid var(--line2);border-radius:20px;padding:16px;display:grid;gap:14px;min-width:0}
.gl-zakl{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.gl-zakl-karty{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.gl-tab{min-height:44px;padding:0 16px;border-radius:10px;border:1px solid var(--line2);background:transparent;color:var(--body);font:600 14px var(--text);cursor:pointer}
.gl-tab[aria-selected=true]{background:var(--card2);border-color:var(--mid);color:var(--paper)}
.gl-tab:focus-visible{outline:2px solid var(--tip);outline-offset:2px}
.gl-auto{margin-left:auto;font:12px var(--mono);color:var(--stone)}
.gl-stos{display:grid}
.gl-widok{grid-area:1/1;align-content:start;display:grid;gap:14px;background:var(--card);border:1px solid var(--line);border-radius:16px;padding:18px;min-width:0}
.gl-widok[data-off]{visibility:hidden;opacity:0}
@media(prefers-reduced-motion:no-preference){.gl-widok{transition:opacity .35s ease}}
.gl-widok-g{display:flex;justify-content:space-between;align-items:baseline;gap:8px;flex-wrap:wrap}
.gl-widok-g b{color:var(--paper);font-size:16px}
.gl-mono{font:12px var(--mono);color:var(--mint)}
.gl-legenda{display:flex;gap:18px;flex-wrap:wrap;font-size:13px}
.gl-legenda i{display:inline-block;width:12px;height:3px;vertical-align:middle;margin-right:6px}
.gl-wykres{width:100%;height:auto;display:block}
.gl-rach{background:var(--page);border:1px solid var(--line);border-radius:14px;padding:14px 16px;display:grid;gap:9px}
.gl-rach-w{display:flex;justify-content:space-between;gap:12px;font-size:14px}
.gl-rach-w b{color:var(--paper)}
.gl-rach-suma{display:flex;justify-content:space-between;align-items:baseline;gap:12px;flex-wrap:wrap;border-top:1px solid var(--line2);padding-top:9px}
.gl-rach-suma b{color:var(--paper)}
.gl-rach-suma strong{color:var(--paper);font-size:20px}
.gl-mini{font-size:12px;color:var(--stone)}
.gl-limit{height:6px;border-radius:6px;background:#1a2a23;overflow:hidden}
.gl-limit i{display:block;height:100%;background:var(--mint);border-radius:6px}
.gl-plus{color:var(--mint)}
.ch-line{stroke-dasharray:1;stroke-dashoffset:0}
@media(prefers-reduced-motion:no-preference){
.ch-line{stroke-dashoffset:1;animation:glDraw 7s ease-in-out infinite}
.ch-moc{animation-delay:.25s}
.ch-area{animation:glFade 7s ease-in-out infinite}
.ch-dot{transform-box:fill-box;transform-origin:center;animation:glDot 7s ease-in-out infinite}
@keyframes glDraw{0%{stroke-dashoffset:1}38%{stroke-dashoffset:0}92%{stroke-dashoffset:0;opacity:1}100%{stroke-dashoffset:0;opacity:0}}
@keyframes glFade{0%,25%{opacity:0}45%,92%{opacity:1}100%{opacity:0}}
@keyframes glDot{0%,28%{opacity:0;transform:scale(.4)}34%{opacity:1;transform:scale(1.5)}40%,92%{opacity:1;transform:scale(1)}100%{opacity:0}}
}

/* przeniesienie w hero */
.gl-segi{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:4px}
.gl-segi i{height:6px;border-radius:6px;background:#1a2a23}
.gl-segi i[data-s=ok]{background:var(--mint)}
.gl-segi i[data-s=teraz]{background:#E8B450}
.gl-etapy{list-style:none;margin:0;padding:0;display:grid}
.gl-etap{display:flex;gap:14px;align-items:stretch}
.gl-etap-l{display:flex;flex-direction:column;align-items:center;width:22px;flex:none}
.gl-kolo{width:22px;height:22px;border-radius:50%;border:2px solid #3a4a43;display:grid;place-items:center;flex:none;box-sizing:border-box}
.gl-etap[data-s=ok] .gl-kolo{background:var(--mint);border-color:var(--mint)}
.gl-etap[data-s=teraz] .gl-kolo{border-color:#E8B450}
.gl-etap[data-s=teraz] .gl-kolo::after{content:"";width:8px;height:8px;border-radius:50%;background:#E8B450}
.gl-lacznik{flex:1;width:2px;min-height:14px;margin:5px 0;border-radius:2px;background:#1f2f28}
.gl-etap[data-s=ok] .gl-lacznik{background:var(--mint)}
.gl-etap[data-s=teraz] .gl-lacznik{background:#E8B450}
.gl-etap:last-child .gl-lacznik{display:none}
.gl-etap-t{display:grid;gap:2px;padding-bottom:12px;align-content:start}
.gl-etap-t b{color:var(--paper);font-size:15px;line-height:22px}
.gl-etap[data-s=czeka] .gl-etap-t b{color:var(--stone)}
.gl-etap-t span{font-size:13px;color:var(--stone)}
@media(prefers-reduced-motion:no-preference){
.gl-segi i[data-s=teraz]{background:linear-gradient(90deg,rgba(232,180,80,.25) 0%,#E8B450 50%,rgba(232,180,80,.25) 100%);background-size:200% 100%;animation:glSeg 1.4s linear infinite}
.gl-etap[data-s=teraz] .gl-lacznik{background:linear-gradient(180deg,#E8B450 0%,rgba(232,180,80,.15) 40%,#E8B450 80%,rgba(232,180,80,.15) 100%);background-size:100% 24px;animation:glFlow 1s linear infinite}
.gl-etap[data-s=teraz] .gl-kolo{animation:glPuls 1.6s ease-in-out infinite}
@keyframes glSeg{from{background-position:100% 0}to{background-position:-100% 0}}
@keyframes glFlow{from{background-position:0 0}to{background-position:0 24px}}
@keyframes glPuls{0%,100%{box-shadow:0 0 0 0 rgba(232,180,80,.45)}50%{box-shadow:0 0 0 7px rgba(232,180,80,0)}}
}

/* liczby */
.gl-liczby{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));background:var(--card);border:1px solid var(--line);border-radius:18px;overflow:hidden}
.gl-liczba{padding:22px 24px;display:grid;gap:4px;align-content:start;border-bottom:1px solid var(--line)}
.gl-liczba strong{font:800 clamp(24px,6vw,30px)/1.1 var(--display);color:var(--paper)}
.gl-liczba span{font-size:14px}
.gl-liczba a{font:12px var(--mono);color:var(--mint)}
@media(min-width:900px){.gl-liczba{border-bottom:0;border-right:1px solid var(--line)}.gl-liczba:last-child{border-right:0}}

/* panel klienta */
.gl-panel-zakl{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:18px}
.gl-panel{display:grid;gap:32px;align-items:center}
.gl-panel-txt{display:grid;gap:14px;align-content:start}
.gl-panel-txt[hidden]{display:none}
.gl-panel-txt h3{font-size:26px;margin:0}
.gl-panel-txt p{margin:0}
.gl-okno{border-radius:16px;overflow:hidden;border:1px solid var(--line2);box-shadow:0 30px 70px rgba(0,0,0,.45);min-width:0}
.gl-okno-g{display:flex;align-items:center;gap:10px;padding:10px 14px;background:var(--pine);border-bottom:1px solid var(--line)}
.gl-kropki{display:flex;gap:6px}
.gl-kropki i{width:10px;height:10px;border-radius:50%;background:#2a3a33}
.gl-adres{font:12px var(--mono);color:var(--stone);background:var(--page);border-radius:6px;padding:4px 10px;flex:1;max-width:320px}
.gl-okno-c{display:grid;min-height:420px}
.gl-menu{display:none;background:var(--pine);padding:16px 10px;gap:2px;align-content:start;border-right:1px solid var(--line)}
.gl-menu-logo{font:800 20px var(--display);color:var(--paper);padding:0 12px 14px}
.gl-menu span{display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:9px;font-size:13.5px;color:var(--body)}
.gl-menu span i{width:16px;height:16px;border-radius:4px;border:1.5px solid currentColor;opacity:.7;flex:none}
.gl-menu span[data-on]{background:var(--card);color:var(--paper)}
.gl-glowna{background:#F4F4EE;padding:18px 20px;display:grid;gap:14px;align-content:start;color:#0C1A14;min-width:0}
.gl-glowna-g{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}
.gl-szukaj{font-size:12px;color:#5d6b64;border:1px solid #d9ddd6;border-radius:8px;padding:5px 10px;background:#fff}
.gl-pv{grid-area:1/1;align-content:start;display:grid;gap:12px;min-width:0}
.gl-pv[data-off]{visibility:hidden;opacity:0}
@media(prefers-reduced-motion:no-preference){.gl-pv{transition:opacity .3s ease}}
.gl-pv-t{font:800 22px var(--display);color:#0C1A14}
.gl-pc{background:#fff;border:1px solid #e3e6df;border-radius:12px;padding:14px 16px}
.gl-pl{font-size:12px;color:#5d6b64}
.gl-pc b,.gl-pc strong{color:#0C1A14}
.gl-pbar{display:block;height:6px;border-radius:6px;background:#e9ece6;overflow:hidden}
.gl-pbar i{display:block;height:100%;border-radius:6px;background:#0F7A52}
.gl-pbtn{display:inline-flex;align-items:center;min-height:36px;padding:0 14px;border-radius:8px;background:#0F7A52;color:#fff;font-size:13px;font-weight:600}
.gl-pbtn[data-off]{background:#c9d1cc;color:#3d4a43}
.gl-pchip{display:inline-flex;align-items:center;gap:6px;font-size:12px;padding:3px 9px;border-radius:999px;background:#e2f3ec;color:#0b5f40;font-weight:600}
.gl-pchip[data-w]{background:#fbf1dd;color:#7a5208}
.gl-g3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
.gl-wiersz{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:11px 0;border-bottom:1px solid #eef0eb;font-size:14px;color:#0C1A14}
.gl-wiersz:last-child{border-bottom:0}
.gl-slupki{display:flex;align-items:flex-end;gap:8px;height:80px}
.gl-slupki i{flex:1;background:#bfe3d3;border-radius:4px}
.gl-slupki i:last-child{background:#0F7A52}
.gl-uwaga{font-size:12px;color:var(--stone);margin-top:12px}
@media(max-width:600px){.gl-g3{grid-template-columns:1fr}}
@media(min-width:720px){.gl-okno-c{grid-template-columns:190px minmax(0,1fr)}.gl-menu{display:grid}}
@media(min-width:1024px){.gl-panel{grid-template-columns:minmax(0,4fr) minmax(0,8fr);gap:40px}}

/* rzeczy, które docenisz */
.gl-karty{display:grid;gap:16px;align-items:stretch}
.gl-karta{display:flex;flex-direction:column;gap:14px;padding:26px}
.gl-ik{width:44px;height:44px;border-radius:12px;background:var(--card2);border:1px solid rgba(52,229,160,.25);display:grid;place-items:center;color:var(--mint);flex:none}
.gl-ik svg{width:22px;height:22px}
.gl-karta h3{font-size:19px;margin:0}
.gl-karta p{margin:0}
.gl-etyk{display:flex;flex-wrap:wrap;gap:6px}
.gl-etyk span{font:11.5px var(--mono);padding:4px 8px;border-radius:6px;background:var(--page);border:1px solid var(--line);color:var(--body);white-space:nowrap;max-width:100%;overflow-wrap:anywhere}
@media(max-width:479px){.gl-etyk span{white-space:normal}}
.gl-stopka{margin-top:auto;padding-top:14px;border-top:1px solid var(--line);display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;font-size:14px}
.gl-stopka a{white-space:nowrap;font-weight:600;color:var(--mint)}
.gl-stopka span{color:var(--stone)}
@media(min-width:640px){.gl-karty{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(min-width:1100px){.gl-karty.n4{grid-template-columns:repeat(4,minmax(0,1fr))}.gl-karty.n4 .gl-karta h3{min-height:2.3em}}

/* cennik */
.gl-cennik{display:grid;gap:24px;align-items:start}
.gl-cena{display:grid;gap:20px;padding:28px;border-color:rgba(52,229,160,.35)}
.gl-proba{background:var(--card2);border:1px solid rgba(52,229,160,.25);border-radius:12px;padding:14px 16px;display:grid;gap:4px}
.gl-proba b{color:var(--paper)}
.gl-proba span{font-size:14px}
.gl-cena .btn{width:100%}
.gl-alt{text-align:center;font-size:15px}
.gl-cechy{display:grid;gap:16px}
.gl-cecha{display:grid;gap:8px;align-content:start;padding:22px}
.gl-cecha h3{font-size:16px;margin:0 0 2px}
.gl-cecha ul{list-style:none;margin:0;padding:0;display:grid;gap:8px}
.gl-cecha li{display:flex;gap:10px}
.gl-tabela{overflow-x:auto;padding:0}
.gl-tabela h3{font-size:16px;margin:0;padding:18px 18px 4px}
.gl-tabela table{border-collapse:collapse;width:100%;min-width:560px}
.gl-tabela th,.gl-tabela td{text-align:left;padding:14px 18px;border-bottom:1px solid var(--line);vertical-align:top;font-size:15px}
.gl-tabela thead th{font:500 12px var(--mono);letter-spacing:.06em;text-transform:uppercase;color:var(--stone)}
.gl-tabela tbody th{color:var(--paper);font-weight:600}
.gl-tabela tr:last-child td,.gl-tabela tr:last-child th{border-bottom:0}
.gl-tabela small{display:block;font-size:13px;color:var(--stone);font-weight:400}
@media(min-width:640px){.gl-cechy{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(min-width:1024px){.gl-cennik{grid-template-columns:minmax(0,5fr) minmax(0,7fr);gap:28px}.gl-cena{position:sticky;top:96px}}

/* przeniesienie */
.gl-kroki{list-style:none;margin:0;padding:0;display:grid;gap:16px}
.gl-kroki>li{display:flex;min-width:0}
.gl-kroki .gl-krok{width:100%}
.gl-krok{display:grid;gap:10px;align-content:start;padding:24px}
.gl-krok[data-a]{border-color:rgba(52,229,160,.35)}
.gl-krok h3{margin:0;font-size:19px}
.gl-krok p{margin:0;font-size:15px}
.gl-krok .gl-mono{color:var(--mint)}
.gl-kto{font:12px var(--mono);color:var(--stone)}
.gl-czasy{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));margin-top:16px;padding:0;overflow:hidden}
.gl-czas{padding:22px 24px;display:grid;gap:4px;border-bottom:1px solid var(--line)}
.gl-czas:first-child{background:var(--card2)}
.gl-czas small{font:11.5px var(--mono);letter-spacing:.06em;color:var(--stone)}
.gl-czas:first-child small{color:var(--mint)}
.gl-czas strong{font:800 30px/1.1 var(--display);color:var(--paper)}
.gl-czas span{font-size:13.5px}
.gl-orient{font-size:12.5px;color:var(--stone);margin:10px 0 0}
.gl-ramki{display:grid;gap:16px;margin-top:16px}
.gl-ramka{display:flex;gap:18px;align-items:center;flex-wrap:wrap;padding:24px}
.gl-ramka>div{flex:1 1 260px;display:grid;gap:4px}
.gl-ramka b{color:var(--paper);font-size:18px}
.gl-ramka span{font-size:15px}
.gl-ramka[data-pilne]{background:var(--card2);border-color:rgba(232,180,80,.4)}
@media(min-width:640px){.gl-kroki{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(min-width:900px){.gl-czas{border-bottom:0;border-right:1px solid var(--line)}.gl-czas:last-child{border-right:0}.gl-ramki{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(min-width:1100px){.gl-kroki{grid-template-columns:repeat(4,minmax(0,1fr))}}

/* zasady */
.gl-zasady{display:grid;grid-template-columns:minmax(0,1fr);gap:16px;align-items:stretch}
.gl-zasada{display:flex;flex-direction:column;gap:14px;padding:28px}
.gl-zasada-g{display:flex;gap:14px;align-items:center}
.gl-zasada-g h3{margin:0;font-size:19px}
.gl-zasada p{margin:0;font-size:15px}
.gl-sla{display:grid;grid-template-columns:repeat(auto-fit,minmax(64px,1fr));gap:8px;text-align:center}
.gl-sla div{background:var(--page);border-radius:10px;padding:10px 4px}
.gl-sla b{color:var(--paper);display:block}
.gl-sla span{font-size:12px;color:var(--stone)}
.gl-firma{display:grid;gap:24px;align-items:center;margin-top:16px;padding:28px}
.gl-firma-kto{display:grid;gap:8px}
.gl-firma-kto small{font:11.5px var(--mono);letter-spacing:.06em;color:var(--stone)}
.gl-firma-kto b{color:var(--paper);font:700 22px var(--display)}
.gl-dokumenty{list-style:none;margin:0;padding:0;display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(min(170px,100%),1fr))}
.gl-dokumenty a{display:grid;gap:2px;padding:14px 16px;border-radius:12px;background:var(--page);border:1px solid var(--line);text-decoration:none;height:100%;box-sizing:border-box}
.gl-dokumenty a:hover{border-color:rgba(52,229,160,.45)}
.gl-dokumenty b{color:var(--paper);font-size:15px}
.gl-dokumenty span{font-size:12.5px;color:var(--stone)}
@media(min-width:900px){.gl-zasady{grid-template-columns:repeat(2,minmax(0,1fr))}.gl-firma{grid-template-columns:minmax(0,4fr) minmax(0,7fr);gap:32px}}

/* FAQ */
.gl-faq{display:grid;gap:28px;align-items:start}
.gl-faq-g{display:grid;gap:12px}
.gl-faq-g h2{margin:0}
@media(min-width:1024px){.gl-faq{grid-template-columns:minmax(0,4fr) minmax(0,7fr);gap:48px}}
`;
