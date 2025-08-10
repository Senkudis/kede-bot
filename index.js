const { Client, LocalAuth, Location } = require('whatsapp-web.js');
const fs = require('fs');
const cron = require('node-cron');
const path = require('path');
const puppeteer = require('puppeteer');
const QRCode = require('qrcode');
const axios = require('axios');
const FormData = require('form-data');

const DATA_FILE = path.join(__dirname, 'data.json');

let data = { subscribers: [], pendingQuiz: {}, stats: {} };
if (fs.existsSync(DATA_FILE)) {
  try { 
    data = JSON.parse(fs.readFileSync(DATA_FILE)); 
  } catch (e) { 
    console.error('خطأ في قراءة data.json', e); 
  }
}
function saveData(){ 
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2)); 
}

const greetings = [
  "صباح الخير يا زول! 🌞", "صبحك الله بالخير!", "صباح النور يا الغالي!"
];
const sudaneseJokes = [
  "مرة واحد سوداني قلب طيارة.. قالوا ليهو ليه؟ قال: داير أطير زي البط!",
  "فيهو واحد قال لصاحبه: الجو حار شديد، صاحبه قال ليهو: ده لأنو الشمس جايه من الخرطوم!"
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

// رفع QR لموقع imgbb
client.on('qr', async qr => {
  console.log('📌 جاري توليد ورفع كود QR...');
  const qrPath = path.join(__dirname, 'qr.png');

  try {
    await QRCode.toFile(qrPath, qr);

    const form = new FormData();
    form.append('image', fs.createReadStream(qrPath));

    const uploadRes = await axios.post(
      'https://api.imgbb.com/1/upload?key=8df2f63e10f44cf4f6f7d99382861e76',
      form,
      { headers: form.getHeaders() }
    );

    if (uploadRes.data && uploadRes.data.data && uploadRes.data.data.url) {
      console.log('✅ رابط الـ QR:', uploadRes.data.data.url);
    } else {
      console.log('❌ فشل رفع الـ QR:', uploadRes.data);
    }
  } catch (err) {
    console.error('❌ خطأ في حفظ أو رفع QR:', err);
  }
});

client.on('ready', () => {
  console.log('البوت جاهز ✅');
});

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
  if (i !== -1) { 
    data.subscribers.splice(i,1); 
    saveData(); 
    return true; 
  }
  return false;
}
function pickRandom(arr){ return arr[Math.floor(Math.random()*arr.length)]; }

// رسائل الصباح
cron.schedule('0 8 * * *', () => {
  const text = pickRandom(greetings) + "\nحاب تشارك في لعبة اليوم؟ اكتب 'سؤال'";
  data.subscribers.forEach(id => client.sendMessage(id, text));
}, { timezone: 'Africa/Khartoum' });

// رسائل المساء
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
    return msg.reply(`اللي ربحت (id): ${pick}`);
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
    const latitude = 15.5007;
    const longitude = 32.5599;
    const description = '📍 موقعي الحالي في الخرطوم';
    return client.sendMessage(from, new Location(latitude, longitude, description));
  }
});

client.initialize();
