const { Client, LocalAuth, Location } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const cron = require('node-cron');
const path = require('path');
const puppeteer = require('puppeteer');
const QRCode = require('qrcode'); // إضافة مكتبة qrcode لحفظ الصورة

const DATA_FILE = path.join(__dirname, 'data.json');

let data = { subscribers: [], pendingQuiz: {}, stats: {} };
if (fs.existsSync(DATA_FILE)) {
  try { data = JSON.parse(fs.readFileSync(DATA_FILE)); } catch (e) { console.error('خطأ في قراءة data.json', e); }
}
function saveData(){ fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2)); }

const greetings = [
  "صباح الخير يا زول! 🌞", "صبحك الله بالخير!", "صباح النور يا الغالي!"
];
const sudaneseJokes = [
  "مرة واحد سوداني قلب طيارة.. قالوا ليهو ليه؟ قال: داير أطير زي البط!",
  "فيهو واحد قال لصاحبه: الجو حار شديد، صاحبه قال ليهو: ده لأنو الشمس جايه من الخرطوم!"
];
const sudaneseProverbs = [
  "الجار قبل الدار", "اللي ما يعرف الصقر يشويه"
];
const triviaQuestions = [
  { q: "ما هي عاصمة السودان؟\nأ) الخرطوم\nب) أم درمان\nج) الأبيض", answer: "أ" },
  { q: "ما هو النهر الأشهر في السودان؟\nأ) النيل\nب) الدمحله\nج) السنجة", answer: "أ" }
];

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--single-process',
      '--disable-gpu'
    ],
    executablePath: puppeteer.executablePath()
  }
});

// تعديل حدث الـ QR لحفظه كصورة
client.on('qr', async qr => {
  // طباعة QR في الطرفية
  qrcode.generate(qr, { small: true });
  console.log('امسح QR بكاميرا واتساب أو افتح ملف qr.png');

  // حفظ QR كصورة PNG
  try {
    await QRCode.toFile(path.join(__dirname, 'qr.png'), qr);
    console.log('✅ تم حفظ qr.png في مجلد المشروع');
  } catch (err) {
    console.error('❌ فشل في حفظ صورة QR:', err);
  }
});

client.on('ready', () => { console.log('البوت جاهز ✅'); });

function addSubscriber(id){
  if (!data.subscribers.includes(id)) {
    data.subscribers.push(id);
    saveData();
    return true;
  }
  return false;
}
function removeSubscriber(id){
  const i = data.subscribers.indexOf(id);
  if (i !== -1) { data.subscribers.splice(i,1); saveData(); return true; }
  return false;
}
function pickRandom(arr){ return arr[Math.floor(Math.random()*arr.length)]; }

cron.schedule('0 8 * * *', () => {
  const text = pickRandom(greetings) + "\nحاب تشارك في لعبة اليوم؟ اكتب 'سؤال'";
  data.subscribers.forEach(id => client.sendMessage(id, text));
}, { timezone: 'Africa/Khartoum' });

cron.schedule('0 20 * * *', () => {
  const text = "مساء الخير! دا ما تنسى تضحك شوية 😊\nاكتب 'نكتة' عشان نرسل ليك واحدة.";
  data.subscribers.forEach(id => client.sendMessage(id, text));
}, { timezone: 'Africa/Khartoum' });

client.on('message', async msg => {
  const from = msg.from;
  const body = (msg.body || '').trim();

  if (body === 'اشترك') {
    const added = addSubscriber(from);
    return msg.reply(added ? 'تم الاشتراك في جدول الرسائل 🎉' : 'أنت مشترك أصلًا.');
  }
  if (body === 'الغاء') {
    const rem = removeSubscriber(from);
    return msg.reply(rem ? 'تم إلغاء الاشتراك.' : 'أنت ما مشترك أساسًا.');
  }
  if (body === 'مساعدة' || body === 'help') {
    return msg.reply(
`أهلاً بيك في بوت كيدي! 🤖
من إنشاء ضياء الدين
للتواصل: https://www.facebook.com/DiyaAldinKD
تصفح الموقع: https://kede-store.odoo.com

أوامر البوت:
اشترك - للاشتراك في جدول الرسائل
الغاء - لإلغاء الاشتراك
نكتة - إرسال نكتة سودانية
سؤال - نبدأ سؤال تريفيا
إجابتك: أ/ب/ج - للرد على السؤال
سحب - سحب عشوائي من المشتركين
موقع - إرسال موقعي
مساعدة - هذه الرسالة`
    );
  }
  if (body === 'نكتة') {
    return msg.reply(pickRandom(sudaneseJokes));
  }
  if (body === 'سحب') {
    if (data.subscribers.length === 0) return msg.reply('ما في مشتركين أبداً.');
    const pick = pickRandom(data.subscribers);
    return msg.reply(`اللي ربحت (id): ${pick}\nلو دا بوت داخل جروب ممكن نطلع الاسم الحقيقي.`);
  }
  if (body === 'سؤال') {
    const q = pickRandom(triviaQuestions);
    data.pendingQuiz[from] = q;
    saveData();
    return msg.reply(q.q + '\nأرسل إجابتك: أ/ب/ج');
  }
  if (['أ','ب','ج','A','B','C','a','b','c'].includes(body)) {
    const pending = data.pendingQuiz[from];
    if (!pending) return msg.reply('مافي سؤال مفتوح ليك الآن. أرسل "سؤال" لتبدأ.');
    const normalized = body.toUpperCase().replace('A','أ').replace('B','ب').replace('C','ج');
    if (normalized === pending.answer) {
      data.stats[from] = (data.stats[from] || 0) + 1;
      delete data.pendingQuiz[from];
      saveData();
      return msg.reply('مبروك! إجابتك صحيحة 🎉');
    } else {
      delete data.pendingQuiz[from];
      saveData();
      return msg.reply('للأسف غلط 😅. تحب سؤال تاني؟ اكتب "سؤال"');
    }
  }
  if (body.toLowerCase().includes('السلام')) {
    return msg.reply('وعليكم السلام يا زول 👋');
  }
  if (body === 'موقع') {
    const latitude = 15.5007;   // خط العرض
    const longitude = 32.5599;  // خط الطول
    const description = '📍 موقعي الحالي في الخرطوم';
    return client.sendMessage(from, new Location(latitude, longitude, description));
  }
});

client.initialize();
