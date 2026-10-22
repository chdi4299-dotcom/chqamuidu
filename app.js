(() => {
"use strict";
const cfg=Object.freeze(window.VEZLIO_CONFIG||{});
const products=[
{name:"YouTube Premium",category:"Entertainment",symbol:"▶",bg:"#fff0f0",fg:"#ef4545",desc:"Explore video and music subscription options."},
{name:"Spotify Premium",category:"Entertainment",symbol:"♫",bg:"#e7f9ec",fg:"#20aa65",desc:"Learn about available music subscription plans."},
{name:"CapCut Pro",category:"Creative",symbol:"✂",bg:"#f2f4f8",fg:"#17223d",desc:"Explore premium video creation capabilities."},
{name:"InShot Pro",category:"Creative",symbol:"▣",bg:"#fff0ee",fg:"#ef8667",desc:"Tools for editing and creating video content."},
{name:"Google AI Pro",category:"AI & Productivity",symbol:"✦",bg:"#eaf1ff",fg:"#5087ef",desc:"Discover AI and productivity plan information."},
{name:"Canva Pro",category:"Creative",symbol:"C",bg:"#ecf8ff",fg:"#4090c6",desc:"Explore design and creative workflow options."},
{name:"Editing tools",category:"Creative",symbol:"◈",bg:"#f1efff",fg:"#8367d5",desc:"Discover more digital content creation tools."},
{name:"AI & productivity",category:"AI & Productivity",symbol:"✳",bg:"#fff5e6",fg:"#d89b42",desc:"Ask about licensed digital productivity products."}
];
const platforms=[
{name:"YouTube",symbol:"▶",bg:"#fff0f0",fg:"#e94343",services:["Video promotion","Channel promotion","Audience development"]},
{name:"Instagram",symbol:"◎",bg:"#fff0f6",fg:"#dc529b",services:["Post promotion","Reels promotion","Audience development"]},
{name:"TikTok",symbol:"♪",bg:"#f0f1f6",fg:"#1e2b43",services:["Video promotion","Profile promotion","Audience development"]},
{name:"Facebook",symbol:"f",bg:"#edf4ff",fg:"#3372da",services:["Page promotion","Post promotion","Audience development"]},
{name:"Telegram",symbol:"➤",bg:"#ebf8ff",fg:"#299ad1",services:["Channel promotion","Community discovery","Audience development"]},
{name:"WhatsApp",symbol:"◉",bg:"#eaf9ee",fg:"#27b96b",services:["Channel promotion","Community discovery","Audience development"]}
];
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const escapeHtml=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
let toastTimer;
function toast(msg){const node=$("#toast");node.textContent=msg;node.classList.add("visible");clearTimeout(toastTimer);toastTimer=setTimeout(()=>node.classList.remove("visible"),4500);}
function renderProducts(){
 const filter=$(".filter-tab.active")?.dataset.filter||"All",q=$("#toolSearch").value.trim().toLowerCase();
 const selected=products.filter(p=>(filter==="All"||p.category===filter)&&(p.name+" "+p.category+" "+p.desc).toLowerCase().includes(q));
 $("#productGrid").innerHTML=selected.length?selected.map((p,i)=>`<article class="product-card"><div class="product-art" style="background:${p.bg};color:${p.fg}" aria-hidden="true">${escapeHtml(p.symbol)}</div><span class="product-category">${escapeHtml(p.category)}</span><h3>${escapeHtml(p.name)}</h3><p>${escapeHtml(p.desc)}</p><button type="button" data-product="${escapeHtml(p.name)}">Check availability &nbsp;↗</button></article>`).join(""):'<p>No matching tools. Try another search or category.</p>';
 $$("#productGrid [data-product]").forEach(b=>b.addEventListener("click",()=>openEnquiry(b.dataset.product)));
}
function openDialog(html){$("#dialogContent").innerHTML=html;$("#infoDialog").showModal();}
function openEnquiry(name){openDialog(`<span class="section-kicker">PRODUCT ENQUIRY</span><h2>${escapeHtml(name)}</h2><p>Available plans, prices, region support, purchase eligibility and reseller authorization must be confirmed before payment. This preview cannot process purchases.</p><button class="btn btn-primary" type="button" id="copyEnquiry">Copy enquiry message ↗</button>`);$("#copyEnquiry").addEventListener("click",()=>copyText("Hello VEZLIO! I'd like details about "+name+" including plan, availability, price and delivery terms."));}
async function copyText(s){try{await navigator.clipboard.writeText(s);toast("Enquiry copied. Send it using your preferred support channel.");}catch{openDialog(`<h2>Copy your enquiry</h2><p>Select and copy this text:</p><textarea readonly style="width:100%;min-height:95px">${escapeHtml(s)}</textarea>`)}}
$$("#toolSearch").forEach(n=>n.addEventListener("input",renderProducts));
$$(".filter-tab").forEach(b=>b.addEventListener("click",()=>{$$(".filter-tab").forEach(x=>x.classList.remove("active"));b.classList.add("active");renderProducts();}));
renderProducts();
$("#platformGrid").innerHTML=platforms.map(p=>`<button type="button" class="platform-card" data-platform="${p.name}"><span class="platform-symbol" style="--bg:${p.bg};--fg:${p.fg}" aria-hidden="true">${escapeHtml(p.symbol)}</span>${escapeHtml(p.name)}</button>`).join("");
$("#smmPlatform").innerHTML=platforms.map(p=>`<option value="${p.name}">${p.name}</option>`).join("");
function setPlatform(name){const p=platforms.find(x=>x.name===name)||platforms[0];$("#smmPlatform").value=p.name;$("#smmService").innerHTML=p.services.map(s=>`<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join("");$$(".platform-card").forEach(b=>b.classList.toggle("selected",b.dataset.platform===name));}
setPlatform(platforms[0].name);
$$(".platform-card").forEach(b=>b.addEventListener("click",()=>{setPlatform(b.dataset.platform);$("#smmForm").scrollIntoView({behavior:matchMedia("(prefers-reduced-motion: reduce)").matches?"instant":"smooth",block:"center"});}));
$("#smmPlatform").addEventListener("change",e=>setPlatform(e.target.value));
$("#smmForm").addEventListener("submit",async e=>{e.preventDefault();const form=e.currentTarget;if(!form.reportValidity())return;const url=$("#smmUrl").value.trim();if(url){try{const u=new URL(url);if(!["https:","http:"].includes(u.protocol))throw Error();}catch{$("#smmFeedback").textContent="Please provide a valid public https:// URL.";return;}}const qty=$("#smmQuantity").value;const message=`Hello VEZLIO! I'd like to enquire about a legitimate social media campaign. Platform: ${$("#smmPlatform").value}. Service: ${$("#smmService").value}. ${qty?"Target quantity: "+qty+". ":""}${url?"Public URL: "+url+". ":""}Please share available options, conditions and a quotation.`;$("#smmFeedback").textContent="No order was created and no payment was taken.";await copyText(message);});
$("#currentYear").textContent=new Date().getFullYear();
$("#menuToggle").addEventListener("click",()=>{const nav=$("#mobileNav"),opened=nav.hidden;nav.hidden=!opened;$("#menuToggle").setAttribute("aria-expanded",String(opened));});
$$(".mobile-nav a").forEach(x=>x.addEventListener("click",()=>{$("#mobileNav").hidden=true;$("#menuToggle").setAttribute("aria-expanded","false");}));
function unavailable(){openDialog('<span class="section-kicker">COMING IN A FUTURE RELEASE</span><h2>Customer accounts are not live yet.</h2><p>Browse our catalogue and prepare enquiries. Customer sign-in and checkout are not yet available.</p>');}
$("#signinBtn").addEventListener("click",unavailable);$("#mobileSignin").addEventListener("click",unavailable);
const answers={tools:"You can browse digital tool categories and prepare a product enquiry. Current prices, availability and reseller eligibility require confirmation.",smm:"Browse Social Media Boosting Services, choose a quantity and prepare an enquiry with a verified quote. You can also request a tailored campaign below. No order or payment is created.",payments:"Payments are not enabled in this preview. Do not send money based on the website alone. Contact the business through its verified official support channels.",contact:"WhatsApp and Telegram contact buttons will work after the owner configures verified destinations. You can prepare and copy an enquiry meanwhile.",refund:"Refund and fulfillment terms depend on the specific verified product or campaign; no sale is processed by this preview.",default:"I'm a simple on-page FAQ assistant, not a live AI model. Ask about tools, services, payments, refunds or contact. For anything else, use the verified support channels when available."};
function showBot(){const panel=$("#botPanel");panel.hidden=false;$("#botButton").setAttribute("aria-expanded","true");$("#botInput").focus();}
function closeBot(){$("#botPanel").hidden=true;$("#botButton").setAttribute("aria-expanded","false");$("#botButton").focus();}
$("#botButton").addEventListener("click",()=>$("#botPanel").hidden?showBot():closeBot());$("#botClose").addEventListener("click",closeBot);
["#openBotFromFaq","#openBotFromCta","#footerHelp"].forEach(s=>$(s).addEventListener("click",showBot));
function appendMessage(msg,role){const node=document.createElement("div");node.className="bot-message "+(role==="user"?"user-message":"assistant-message");node.textContent=msg;$("#botMessages").appendChild(node);$("#botMessages").scrollTop=$("#botMessages").scrollHeight;}
function answer(key,label){appendMessage(label,"user");appendMessage(answers[key]||answers.default,"assistant");}
$$(".bot-quick-actions button").forEach(b=>b.addEventListener("click",()=>answer(b.dataset.question,b.textContent)));
$("#botForm").addEventListener("submit",e=>{e.preventDefault();const input=$("#botInput"),msg=input.value.trim();if(!msg)return;const l=msg.toLowerCase();const key=/refund|warranty|guarantee/.test(l)?"refund":/price|pay|bank|money|wallet|card/.test(l)?"payments":/youtube|spotify|capcut|inshot|tool|subscription|gemini|google|canva/.test(l)?"tools":/smm|view|like|follower|subscriber|member|promotion|boost|tiktok|instagram|telegram/.test(l)?"smm":/contact|help|whatsapp|phone|support/.test(l)?"contact":"default";answer(key,msg);input.value="";});
function contact(name){if(name==="whatsapp"){const n=String(cfg.whatsappNumber||"").replace(/\D/g,"");if(!/^\d{10,15}$/.test(n)){toast("WhatsApp contact is not configured yet.");return;}window.open("https://wa.me/"+n+"?text="+encodeURIComponent("Hello VEZLIO, I need assistance."),"_blank","noopener,noreferrer");}else{let u;try{u=new URL(cfg.telegramUrl||"");}catch{toast("Telegram contact is not configured yet.");return;}if(u.protocol!=="https:"||u.hostname!=="t.me"){toast("Telegram contact must be a valid https://t.me/ link.");return;}window.open(u.href,"_blank","noopener,noreferrer");}}
$("#whatsappButton").addEventListener("click",()=>contact("whatsapp"));$("#telegramButton").addEventListener("click",()=>contact("telegram"));
const policy={
privacy:["Privacy Policy — Draft","This storefront does not create customer accounts, collect payment information or store enquiries. Service IDs and quantities are sent to our server to verify quotes. Enquiry messages and public page links stay in your browser unless you copy and send them through your chosen support channel. Browser or hosting infrastructure may collect routine technical logs. Any future production launch needs a reviewed, business-specific privacy notice describing data handling, purposes, recipients and retention."],
terms:["Terms & Conditions — Draft","Products and third-party names are displayed for identification only; VEZLIO is not presented as an official partner or reseller. Availability, authorization, pricing, duration and fulfillment must be independently confirmed. No order, contract or payment is formed through this preview. Social promotion services must comply with applicable rules and platform policies. These draft terms require legal review before launch."],
refund:["Refund Policy — Draft","No online sales are currently enabled. Refund eligibility, delivery periods and support commitments must be documented for each lawful offering before checkout goes live. Do not represent subscriptions as lifetime or guaranteed unless verified. This draft requires review before commercial launch."]
};
$$("[data-policy]").forEach(b=>b.addEventListener("click",()=>{const [title,body]=policy[b.dataset.policy];openDialog(`<span class="section-kicker">VEZLIO / LEGAL INFORMATION</span><h2>${title}</h2><p>${body}</p>`);}));
$("#closeDialog").addEventListener("click",()=>$("#infoDialog").close());
$("#infoDialog").addEventListener("click",e=>{if(e.target===$("#infoDialog"))$("#infoDialog").close();});
})();
