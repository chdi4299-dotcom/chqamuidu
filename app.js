(() => {
"use strict";
let cfg=Object.freeze(window.VEZLIO_CONFIG||{});
const discoveryProducts=[
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
let products=discoveryProducts, publishedServices=[];
const priceLabel=value=>value==null?"Contact for details":new Intl.NumberFormat("en-LK",{style:"currency",currency:"LKR"}).format(value);
const palette={Entertainment:{symbol:"♫",bg:"#fff0f0",fg:"#e94343"},Creative:{symbol:"◈",bg:"#f1efff",fg:"#8367d5"},"AI & Productivity":{symbol:"✦",bg:"#eaf1ff",fg:"#5087ef"},Other:{symbol:"✳",bg:"#ecf8ff",fg:"#4090c6"}};
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const escapeHtml=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
let toastTimer;
function toast(msg){const node=$("#toast");node.textContent=msg;node.classList.add("visible");clearTimeout(toastTimer);toastTimer=setTimeout(()=>node.classList.remove("visible"),4500);}
function renderProducts(){
 const filter=$(".filter-tab.active")?.dataset.filter||"All",q=$("#toolSearch").value.trim().toLowerCase();
 const selected=products.filter(p=>(filter==="All"||p.category===filter)&&(p.name+" "+p.category+" "+p.desc).toLowerCase().includes(q));
 $("#productGrid").innerHTML=selected.length?selected.map((p,i)=>`<article class="product-card"><div class="product-art" style="background:${p.bg};color:${p.fg}" aria-hidden="true">${escapeHtml(p.symbol)}</div><span class="product-category">${escapeHtml(p.category)}</span><h3>${escapeHtml(p.name)}</h3><p>${escapeHtml(p.desc)}</p><button type="button" data-product="${escapeHtml(p.id||p.name)}">Check availability &nbsp;↗</button></article>`).join(""):'<p>No matching tools. Try another search or category.</p>';
 $$("#productGrid [data-product]").forEach(b=>b.addEventListener("click",()=>openEnquiry(b.dataset.product)));
}
function openDialog(html){$("#dialogContent").innerHTML=html;$("#infoDialog").showModal();}
function renderContactDetails(){
 const node=$("#contactDetails");node.replaceChildren();
 if(cfg.supportNote){const note=document.createElement("p");note.textContent=cfg.supportNote;node.append(note);}
 if(cfg.supportEmail&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cfg.supportEmail)){const link=document.createElement("a");link.href="mailto:"+encodeURIComponent(cfg.supportEmail);link.textContent=cfg.supportEmail;node.append(link);}
 const available=/^[1-9]\d{9,14}$/.test(String(cfg.whatsappNumber||""));
 $("#smmWhatsApp").disabled=!available;$("#smmWhatsApp").title=available?"Open an enquiry draft":"WhatsApp is not configured; use Copy enquiry.";
}
function enquiryDestination(message){
 const n=String(cfg.whatsappNumber||"");
 if(!/^[1-9]\d{9,14}$/.test(n)){toast("WhatsApp is not configured. Copy your enquiry instead.");return false;}
 window.open("https://wa.me/"+n+"?text="+encodeURIComponent(message),"_blank","noopener,noreferrer");return true;
}
function openEnquiry(key){
 const p=products.find(x=>(x.id||x.name)===key),name=p?.name||key,plans=p?.packages||[];
 openDialog(`<span class="section-kicker">PRODUCT ENQUIRY</span><h2>${escapeHtml(name)}</h2><p>${escapeHtml(p?.desc||"")}</p>${p?.compatibility?`<p>Compatibility: ${escapeHtml(p.compatibility)}</p>`:""}${plans.length?`<div class="field"><label for="planSelect">Subscription package</label><select id="planSelect">${plans.map(k=>`<option value="${escapeHtml(k.id)}">${escapeHtml(k.name)}</option>`).join("")}</select></div><p id="planMeta"></p>`:'<p>Contact for current plans, duration, prices, availability and eligible regions.</p>'}<p>Enquiries only. No order or payment is created. Authorization and applicable terms must be confirmed before purchase.</p><div class="hero-ctas"><button class="btn btn-primary" type="button" id="whatsappEnquiry">Enquire via WhatsApp ↗</button><button class="btn btn-outline" type="button" id="copyEnquiry">Copy enquiry</button></div>`);
 const current=()=>plans.find(k=>k.id===$("#planSelect")?.value);
 const message=()=>{const plan=current();return `Hello VEZLIO! I'd like details about ${name}.${plan?` Package: ${plan.name}. Duration: ${plan.duration||"To confirm"}. Price: ${priceLabel(plan.price_lkr)}. Availability: ${plan.availability}.`:""} Please confirm eligibility, availability and the applicable terms. This is an enquiry.`;};
 function details(){const plan=current();if(plan)$("#planMeta").textContent=[priceLabel(plan.price_lkr),plan.duration||"Duration to confirm",{available:"Confirmed available",unavailable:"Currently unavailable",contact:"Contact to confirm availability"}[plan.availability],plan.support_terms||""].filter(Boolean).join(" · ");}
 $("#planSelect")?.addEventListener("change",details);details();
 $("#copyEnquiry").addEventListener("click",()=>copyText(message()));
 $("#whatsappEnquiry").addEventListener("click",()=>enquiryDestination(message()));
}
async function copyText(s){try{await navigator.clipboard.writeText(s);toast("Enquiry copied. Send it using your preferred support channel.");}catch{openDialog(`<h2>Copy your enquiry</h2><p>Select and copy this text:</p><textarea readonly style="width:100%;min-height:95px">${escapeHtml(s)}</textarea>`)}}
$$("#toolSearch").forEach(n=>n.addEventListener("input",renderProducts));
$$(".filter-tab").forEach(b=>b.addEventListener("click",()=>{$$(".filter-tab").forEach(x=>x.classList.remove("active"));b.classList.add("active");renderProducts();}));
renderProducts();
$("#platformGrid").innerHTML=platforms.map(p=>`<button type="button" class="platform-card" data-platform="${p.name}"><span class="platform-symbol" style="--bg:${p.bg};--fg:${p.fg}" aria-hidden="true">${escapeHtml(p.symbol)}</span>${escapeHtml(p.name)}</button>`).join("");
$("#smmPlatform").innerHTML=platforms.map(p=>`<option value="${p.name}">${p.name}</option>`).join("");
function updateServiceDetails(){const service=publishedServices.find(x=>x.id===$("#smmService").value);$("#smmDetails").textContent=service?[service.service_code,service.description,service.scope||"Scope to confirm",priceLabel(service.price_lkr),service.estimated_delivery||"",service.support_terms||""].filter(Boolean).join(" · "):"General interest enquiry. No confirmed service package, delivery time or price is implied.";}
function setPlatform(name){const p=platforms.find(x=>x.name===name)||platforms[0],real=publishedServices.filter(x=>x.platform===p.name);$("#smmPlatform").value=p.name;$("#smmService").innerHTML=real.length?real.map(s=>`<option value="${escapeHtml(s.id)}">${escapeHtml(s.name)}</option>`).join(""):p.services.map(s=>`<option value="${escapeHtml(s)}">${escapeHtml(s)} (enquiry)</option>`).join("");$$(".platform-card").forEach(b=>b.classList.toggle("selected",b.dataset.platform===p.name));updateServiceDetails();}
$("#smmService").addEventListener("change",updateServiceDetails);
setPlatform(platforms[0].name);
$$(".platform-card").forEach(b=>b.addEventListener("click",()=>{setPlatform(b.dataset.platform);$("#smmForm").scrollIntoView({behavior:matchMedia("(prefers-reduced-motion: reduce)").matches?"instant":"smooth",block:"center"});}));
$("#smmPlatform").addEventListener("change",e=>setPlatform(e.target.value));
$("#smmForm").addEventListener("submit",async e=>{e.preventDefault();const form=e.currentTarget;if(!form.reportValidity())return;const url=$("#smmUrl").value.trim();if(url){try{const u=new URL(url);if(!["https:","http:"].includes(u.protocol))throw Error();}catch{$("#smmFeedback").textContent="Please provide a valid public https:// URL.";return;}}const qty=$("#smmQuantity").value,service=publishedServices.find(x=>x.id===$("#smmService").value);const message=`Hello VEZLIO! I'd like to enquire about a legitimate Social Media Boosting campaign. Platform: ${$("#smmPlatform").value}. Service: ${service?service.name+" ("+service.service_code+") · "+priceLabel(service.price_lkr)+(service.scope?" · Scope: "+service.scope:""):$("#smmService").value+" (general enquiry)"}. ${qty?"Target quantity: "+qty+". ":""}${url?"Public URL: "+url+". ":""}Please share available options, conditions and a quotation.`;$("#smmFeedback").textContent="No order was created and no payment was taken.";if(e.submitter?.id==="smmWhatsApp")enquiryDestination(message);else await copyText(message);});
$("#currentYear").textContent=new Date().getFullYear();
$("#menuToggle").addEventListener("click",()=>{const nav=$("#mobileNav"),opened=nav.hidden;nav.hidden=!opened;$("#menuToggle").setAttribute("aria-expanded",String(opened));});
$$(".mobile-nav a").forEach(x=>x.addEventListener("click",()=>{$("#mobileNav").hidden=true;$("#menuToggle").setAttribute("aria-expanded","false");}));
function unavailable(){openDialog('<span class="section-kicker">COMING IN A FUTURE RELEASE</span><h2>Customer accounts are not live yet.</h2><p>This launch foundation is a browsable informational storefront. Customer accounts, order storage and payments are not connected. Owner access is separate and requires secure sign-in and MFA.</p>');}
$("#signinBtn").addEventListener("click",unavailable);$("#mobileSignin").addEventListener("click",unavailable);
const answers={tools:"You can browse digital tool categories and prepare a product enquiry. Current prices, availability and reseller eligibility require confirmation.",smm:"Choose a platform and fill in a Social Media Boosting enquiry. No order, purchased engagement or payment happens here. Ask about genuine promotion methods and transparent terms.",payments:"Payments are not enabled in this preview. Do not send money based on the website alone. Contact the business through its verified official support channels.",contact:"Use the configured WhatsApp and Telegram buttons for help. You can also prepare and copy an enquiry.",refund:"Refund and fulfillment terms depend on the specific verified product or campaign; no sale is processed by this preview.",default:"I'm a simple on-page FAQ assistant, not a live AI model. Ask about tools, services, payments, refunds or contact. For anything else, use the verified support channels when available."};
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
privacy:["Privacy Policy — Draft","This storefront does not create customer accounts, collect payment information or store enquiries on a server. Owner administration uses Supabase Auth, MFA and secure session cookies; catalogue and contact settings are stored in PostgreSQL. Form details are processed locally in the browser to prepare a message for you to copy. Browser or hosting infrastructure may collect routine technical logs. Any future production launch needs a reviewed, business-specific privacy notice describing data handling, purposes, recipients and retention."],
terms:["Terms & Conditions — Draft","Products and third-party names are displayed for identification only; VEZLIO is not presented as an official partner or reseller. Availability, authorization, pricing, duration and fulfillment must be independently confirmed. No order, contract or payment is formed through this preview. Social Media Boosting services must comply with applicable rules and platform policies. These draft terms require legal review before launch."],
refund:["Refund Policy — Draft","No online sales are currently enabled. Refund eligibility, delivery periods and support commitments must be documented for each lawful offering before checkout goes live. Do not represent subscriptions as lifetime or guaranteed unless verified. This draft requires review before commercial launch."]
};
$$("[data-policy]").forEach(b=>b.addEventListener("click",()=>{const [title,body]=policy[b.dataset.policy];openDialog(`<span class="section-kicker">VEZLIO / LEGAL INFORMATION</span><h2>${title}</h2><p>${body}</p>`);}));
$("#closeDialog").addEventListener("click",()=>$("#infoDialog").close());
$("#infoDialog").addEventListener("click",e=>{if(e.target===$("#infoDialog"))$("#infoDialog").close();});
async function loadCatalog(){
 if(!["http:","https:"].includes(location.protocol))return;
 try{
  const response=await fetch("/api/catalog",{cache:"no-store",credentials:"omit"});if(!response.ok)throw Error();
  const data=await response.json();if(!Array.isArray(data.products)||!Array.isArray(data.services)||!data.contacts)throw Error();
  products=data.products.length?data.products.map(p=>({...((palette[p.category])||palette.Other),...p,desc:p.description})):discoveryProducts;
  publishedServices=data.services;cfg=Object.freeze(data.contacts);
  $("#catalogStatus").textContent=data.products.length?"Published catalogue · selected package terms apply. Enquiries only.":"Informational categories · no verified product packages have been published.";
  renderProducts();setPlatform($("#smmPlatform").value);renderContactDetails();
 }catch{
  products=discoveryProducts;publishedServices=[];
  $("#catalogStatus").textContent="Informational categories · live catalogue unavailable. Confirm all package details directly.";
  renderProducts();setPlatform($("#smmPlatform").value);renderContactDetails();
 }
}
renderContactDetails();
loadCatalog();
})();
