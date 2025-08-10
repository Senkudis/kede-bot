require('dotenv').config();
const { Client, LocalAuth, Location } = require('whatsapp-web.js');
const fs = require('fs');
const cron = require('node-cron');
const path = require('path');
const puppeteer = require('puppeteer');
const QRCode = require('qrcode');
const axios = require('axios');
const FormData = require('form-data');

const OPENAI_API_KEY = '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';
const IMGBB_KEY = '8df2f63e10f44cf4f6f7d99382861e76';

const DATA_FILE = path.join(__dirname, 'data.json');
let data = { subscribers: [], pendingQuiz: {}, stats: {}, groupStats: {}, pendingGames: {}, welcomedChats: [] };
if (fs.existsSync(DATA_FILE)) {
  try { data = JSON.parse(fs.readFileSync(DATA_FILE)); } 
  catch (e) { console.error('خطأ في قراءة data.json', e); }
}
function saveData(){ fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2)); }
function pickRandom(arr){ return arr[Math.floor(Math.random() * arr.length)]; }

// نكات
const jokes = [
  "قال ليك في مسطول بكتب مع الأستاذ وكل ما الأستاذ يمسح السبوره يشرط الورقة",
  "مسطول شغال بتاع مرور قبض واحد يفحط قطعة إيصال بثلاثين ألف قام أداه خمسين الف المسطول قالي مامعاي فكه فحط بالعشرين الباقية وتعال.",
  "المزاج زي الفجر — لو صحّيت عليه تتمنى اليوم كله جميل.",
  "مرة واحد قالي أحبك، قلت: حاضر بس خلّيني أخلص شاي الصباح.",
  "قالوا الدنيا جزئين: قهوة وناس طيبة — خلّينا نضيف جزء: ضحكة مع أحبابك."
];

// تريفيا
const triviaQuestions = [
  { q: "ما هي عاصمة السودان؟\nأ) الخرطوم\nب) أم درمان\nج) الأبيض", answer: "أ" },
  { q: "ما هو النهر الأشهر في السودان؟\nأ) النيل\nب) الدمحله\nج) السنجة", answer: "أ" },
  { q: "ما هو العنصر الذي رمزه H؟\nأ) هيليوم\nب) هيدروجين\nج) هافنيوم", answer: "ب" }
];

// تذكيرات الصلاة
const prayerReminders = [
  "قوموا يا عباد الله إلى الصلاة 🙏",
  "حيّ على الصلاة، حيّ على الفلاح 🕌",
  "لا تؤجلوا الصلاة، فالدعاء فيها مستجاب 🙌",
  "الله أكبر، وقت السجود قد حان 🕋",
  "الصلاة نور وراحة للروح، لا تفوّتوها",
  "هلمّوا إلى ذكر الله ولقاء الرحمن",
  "قوموا إلى الصلاة قبل فوات الأوان",
  "اجعل الصلاة عادة، والفوز لك إن شاء الله",
  "يا زول، الصلاة تنور القلب وتصفّي البال",
  "أسرعوا قبل أن يأتي الأجر",
  "اذهب إلى الصلاة واطمئن، الله مع المبادرين",
  "الصلوات الخمس سبب للبركة، لا تغفل عنها",
  "أقم الصلاة لذكري، وارتاح قلبك",
  "فرصة لنتقرّب لله، استغلها الآن",
  "هيا للصلاة — بركة اليوم تبدأ بها"
];

const greetings = [
  "صباح الخير يا زول! 🌞", "صبحك الله بالخير!", "صباح النور يا الغالي!"
];

// معلومات إضافية للأوامر الجديدة
const facts = [
  "أكبر صحراء في العالم هي الصحراء الكبرى.",
  "اللغة العربية هي خامس أكثر لغة تحدثًا في العالم.",
  "السودان يقع في شمال شرق أفريقيا ويطل على البحر الأحمر."
];

const quotes = [
  "كن التغيير الذي تريد أن تراه في العالم. - مهاتما غاندي",
  "العقل زينة، والقلب دليل.",
  "السعادة ليست محطة تصل إليها، بل طريقة للسفر."
];

const randomImages = [
  { url: 'https://i.imgur.com/XYZ123.jpg', caption: 'صورة عشوائية جميلة 1' },
  { url: 'https://i.imgur.com/ABC456.jpg', caption: 'صورة عشوائية جميلة 2' }
];

// دوال مساعدة للأوامر الجديدة
async function getWeather(city) {
  try {
    const apiKey = '316d0c91eed64b65a15211006251008'; // لازم تضيف مفتاح API لو حتستخدم API طقس
    const resp = await axios.get(`http://api.weatherapi.com/v1/current.json?key=${apiKey}&q=${encodeURIComponent(city)}&lang=ar`);
    const data = resp.data;
    return `الطقس في ${data.location.name}: ${data.current.condition.text}\nدرجة الحرارة: ${data.current.temp_c}°C\nالرطوبة: ${data.current.humidity}%\nالريح: ${data.current.wind_kph} كم/س`;
  } catch {
    return 'عذرًا، لم أتمكن من جلب بيانات الطقس.';
  }
}

async function translateText(text, lang) {
  try {
    const resp = await axios.post('https://libretranslate.de/translate', {
      q: text,
      source: 'ar',
      target: lang,
      format: 'text'
    });
    return resp.data.translatedText;
  } catch {
    return 'خطأ في الترجمة.';
  }
}

async function getDates() {
  const today = new Date();
  return `التاريخ اليوم:\n- الميلادي: ${today.toLocaleDateString('en-GB')}\n- الهجري: غير مدعوم حالياً`;
}

async function getNews() {
  // مثال، ممكن تستخدم API أخبار حقيقية مع مفتاح
  return 'آخر الأخبار: ... (هذه ميزة قيد التطوير)';
}

async function getMarketStatus() {
  // مثال
  return 'سوق الأسهم اليوم: ... (ميزة قيد التطوير)';
}

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: true,
    args: [
      '--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas','--no-first-run','--no-zygote',
      '--single-process','--disable-gpu'
    ],
    executablePath: puppeteer.executablePath()
  }
});

let prayerJobs = [];

// رفع QR
client.on('qr', async qr => {
  try {
    console.log('📌 تم توليد QR — جارٍ رفعه...');
    const qrPath = path.join(__dirname, 'qr.png');
    await QRCode.toFile(qrPath, qr);
    const form = new FormData();
    form.append('image', fs.createReadStream(qrPath));
    const resp = await axios.post(`https://api.imgbb.com/1/upload?key=${IMGBB_KEY}`, form, { headers: form.getHeaders() });
    if (resp.data?.data?.url) console.log('✅ رابط الـ QR:', resp.data.data.url);
    fs.unlinkSync(qrPath);
  } catch (err) { console.error('❌ خطأ رفع QR:', err); }
});

client.on('ready', () => {
  console.log('✅ البوت جاهز');
  schedulePrayerReminders();
});

async function getPrayerTimes() {
  try {
    const res = await axios.get('https://api.aladhan.com/v1/timingsByCity', { params: { city: 'Khartoum', country: 'Sudan', method: 2 } });
    return res.data?.data?.timings || null;
  } catch { return null; }
}

async function schedulePrayerReminders() {
  prayerJobs.forEach(j => j.stop());
  prayerJobs = [];
  const times = await getPrayerTimes();
  if (!times) return;
  const map = { Fajr: 'الفجر', Dhuhr: 'الظهر', Asr: 'العصر', Maghrib: 'المغرب', Isha: 'العشاء' };
  for (const key in map) {
    const [h, m] = times[key].split(':').map(Number);
    const job = cron.schedule(`${m} ${h} * * *`, () => {
      const text = `${pickRandom(prayerReminders)}\n🕒 ${map[key]} الآن`;
      [...data.subscribers, ...Object.keys(data.groupStats)].forEach(id => client.sendMessage(id, text).catch(()=>{}));
    }, { timezone: 'Africa/Khartoum' });
    prayerJobs.push(job);
  }
}
cron.schedule('5 0 * * *', schedulePrayerReminders, { timezone: 'Africa/Khartoum' });

// رسائل صباحية ومسائية
cron.schedule('0 8 * * *', () => {
  const text = pickRandom(greetings);
  data.subscribers.forEach(id => client.sendMessage(id, text));
}, { timezone: 'Africa/Khartoum' });

cron.schedule('0 20 * * *', () => {
  const text = "مساء الخير! 😄 اكتب 'نكتة' عشان نضحك.";
  data.subscribers.forEach(id => client.sendMessage(id, text));
}, { timezone: 'Africa/Khartoum' });

async function getContactNameOrNumber(id) {
  try { const c = await client.getContactById(id); return c.pushname || c.name || c.number || id; }
  catch { return id; }
}

// رسالة الترحيب وقائمة الأوامر
function getCommandsList() {
  return `السلام عليكم ورحمة الله معكم كيدي v1.2 من تطوير ضياءالدين ابراهيم
تم تطويري بغرض الترفيه والمرح وجمع المعلومات
إليك طرق استخدامي ولكي تظهر لك هذه اللائحة اكتب فقط "اوامر"

الأوامر المتاحة:
- اشترك: للاشتراك في التذكيرات
- الغاء: لإلغاء الاشتراك
- نكتة: للحصول على نكتة عفوية
- احصائيات القروب: عرض إحصائيات القروب
- العب رقم: لعبة تخمين رقم من 1-10
- لغز: سؤال تريفيا
- حجر، ورق، مقص: لعبة حجر ورق مقص
- ذكاء [سؤالك]: تفاعل مع ذكاء اصطناعي
- طقس [اسم المدينة]: لمعرفة حالة الطقس
- ترجم [النص] إلى [اللغة]: لترجمة النص
- التاريخ: لمعرفة التاريخ اليوم
- معلومة: معلومة عشوائية
- اقتباس: اقتباس عشوائي
- اخبار: آخر الأخبار (قيد التطوير)
- سوق: حالة السوق (قيد التطوير)
- صورة: إرسال صورة عشوائية
- مساعدة تقنية: رابط الدعم التقني

رقم المطور: 249112046348
رابط قروب الواتساب: https://chat.whatsapp.com/GZmrZ8EETk84SreBpM6tPp?mode=ac_t
`;
}

client.on('message_create', async (msg) => {
  // رسالة ترحيب عند إضافة البوت لقروب
  if (msg.from.endsWith('@g.us')) {
    const chat = await msg.getChat();
    if (chat.participants.find(p => p.id._serialized === client.info.wid._serialized)) {
      if (!data.welcomedChats.includes(chat.id._serialized)) {
        data.welcomedChats.push(chat.id._serialized);
        saveData();
        chat.sendMessage(getCommandsList());
      }
    }
  }
});

client.on('message', async msg => {
  const from = msg.from, body = msg.body.trim();

  // ترحيب أول رسالة مباشرة (للفرد)
  if (!msg.from.endsWith('@g.us') && !data.welcomedChats.includes(from)) {
    data.welcomedChats.push(from);
    saveData();
    msg.reply(getCommandsList());
  }

  // ردود عفوية على كلمة النداء "كيدي-بوت-روبوت"
  if (body === 'كيدي-بوت-روبوت') {
    const spontaneousReplies = [
      "أها، كيف أقدر أساعدك يا زول؟",
      "حاضر، قول لي الحاصل شنو!",
      "أنا هنا معاك، شنو المطلوب؟",
      "يا سلام عليك! داير شنو مني؟",
      "سعدت بسؤالك، أطلب ما تشاء!",
      "تفضل يا زول، أنا في الخدمة.",
      "هاك، قولي شنو الأخبار؟",
      "كيدي بوت جاهز يرد على سؤالك!",
      "معاك الروبوت العجيب، قل لي كيف أساعدك.",
      "يا مرحب بيك، قول لي أخبارك!"
    ];
    return msg.reply(spontaneousReplies.join('\n\n'));
  }

  // تحديث احصائيات القروب
  if (msg.isGroup) {
    const chat = await msg.getChat();
    const g = data.groupStats[from] ||= { messages: {}, createdTimestamp: chat.createdTimestamp || Date.now(), participants: [] };
    g.participants = (chat.participants || []).map(p => p.id._serialized);
    const author = msg.author || msg.from;
    g.messages[author] = (g.messages[author] || 0) + 1;
    saveData();
  }

  // أوامر
  if (body === 'اوامر') return msg.reply(getCommandsList());

  if (body === 'اشترك') return msg.reply(data.subscribers.includes(from) ? 'مشترك بالفعل' : (data.subscribers.push(from), saveData(), '✅ اشتركت'));
  if (body === 'الغاء') return msg.reply(data.subscribers.includes(from) ? (data.subscribers.splice(data.subscribers.indexOf(from),1), saveData(), '✅ ألغيت الاشتراك') : 'لست مشتركًا');
  if (body === 'نكتة') return msg.reply(pickRandom(jokes));
  if (body === 'احصائيات') {
    if (!msg.isGroup) return msg.reply('فقط داخل القروبات');
    const chat = await msg.getChat();
    const stats = data.groupStats[from] || { messages: {} };
    const membersCount = chat.participants.length;
    const createdAt = chat.createdTimestamp ? new Date(chat.createdTimestamp).toLocaleString('en-GB', { timeZone: 'Africa/Khartoum' }) : 'غير متوفر';
    const sorted = Object.entries(stats.messages).sort((a,b) => b[1]-a[1]);
    if (!sorted.length) return msg.reply(`📊 تاريخ الإنشاء: ${createdAt}\n👥 الأعضاء: ${membersCount}\nلا بيانات`);
    const [topId, topCount] = sorted[0];
    const [bottomId, bottomCount] = sorted[sorted.length-1];
    const topName = await getContactNameOrNumber(topId), bottomName = await getContactNameOrNumber(bottomId);
    return msg.reply(`📊 تاريخ الإنشاء: ${createdAt}\n👥 الأعضاء: ${membersCount}\n🏆 الأكثر تفاعل: ${topName} (${topCount})\n😴 الأقل تفاعل: ${bottomName} (${bottomCount})`);
  }

  if (body === 'العب رقم') { data.pendingGames[from] = { type: 'guess', number: Math.floor(Math.random()*10)+1, tries: 0 }; saveData(); return msg.reply('اخترت رقم 1-10، خمّن!'); }
  if (data.pendingGames[from]?.type === 'guess' && /^\d+$/.test(body)) {
    const g = data.pendingGames[from], guess = +body;
    g.tries++;
    if (guess === g.number) { delete data.pendingGames[from]; saveData(); return msg.reply(`🎉 صحيح (${guess}) بعد ${g.tries} محاولة`); }
    saveData(); return msg.reply(guess < g.number ? 'أعلى!' : 'أقل!');
  }
  if (body === 'لغز') { const q = pickRandom(triviaQuestions); data.pendingQuiz[from] = q; saveData(); return msg.reply(q.q); }
  if (['أ','ب','ج','A','B','C','a','b','c'].includes(body)) {
    const p = data.pendingQuiz[from];
    if (!p) return;
    const n = body.replace('A','أ').replace('B','ب').replace('C','ج').toUpperCase();
    delete data.pendingQuiz[from]; saveData();
    return msg.reply(n === p.answer ? '✅ صحيح' : '❌ خطأ');
  }
  if (['حجر','ورق','مقص'].includes(body)) {
    const b = pickRandom(['حجر','ورق','مقص']);
    const win = (body==='حجر'&&b==='مقص')||(body==='ورق'&&b==='حجر')||(body==='مقص'&&b==='ورق')?'فزت':body===b?'تعادل':'خسرت';
    return msg.reply(`أنا اخترت: ${b}\n${win}`);
  }

  if (body === 'ذكاء') return msg.reply('🧠 اكتب: ذكاء [سؤالك]');
  if (body.startsWith('ذكاء ')) {
    const prompt = body.slice(6).trim();
    try {
      const resp = await axios.post('https://api.openai.com/v1/chat/completions', { model: 'gpt-3.5-turbo', messages: [{ role: 'user', content: prompt }] }, { headers: { Authorization: `Bearer ${OPENAI_API_KEY}` } });
      return msg.reply(resp.data.choices[0].message.content.trim());
    } catch { return msg.reply('خطأ في OpenAI'); }
  }

  if (body.includes('السلام')) return msg.reply('وعليكم السلام يا زول 👋');

// الموق
});

client.initialize();
