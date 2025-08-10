require('dotenv').config();
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
  try { data = JSON.parse(fs.readFileSync(DATA_FILE)); } 
  catch (e) { console.error('خطأ في قراءة data.json', e); }
}

function saveData(){ fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2)); }
function pickRandom(arr){ return arr[Math.floor(Math.random() * arr.length)]; }

// رسائل
const greetings = [
  "صباح الخير يا زول! 🌞", "صبحك الله بالخير!", "صباح النور يا الغالي!"
];
const sudaneseJokes = [
  "مرة واحد سوداني قلب طيارة.. قالوا ليهو ليه؟ قال: داير أطير زي البط!",
  "فيهو واحد قال لصاحبه: الجو حار شديد، صاحبه قال ليهو: ده لأنو الشمس جايه من الخرطوم!",
  "قالوا لي سوداني ليه دايمًا فرحان؟ قال: لأنو المشاكل ما بتلقى فيني مكان!",
  "مرة واحد سوداني شاف مراية لأول مرة قال: دي صورة أخوي الضايع!"
];
const triviaQuestions = [
  { q: "ما هي عاصمة السودان؟\nأ) الخرطوم\nب) أم درمان\nج) الأبيض", answer: "أ" },
  { q: "ما هو النهر الأشهر في السودان؟\nأ) النيل\nب) الدمحله\nج) السنجة", answer: "أ" }
];
const prayerReminders = [
  "قوموا يا عباد الله إلى الصلاة ⏰",
  "حان وقت الصلاة، لا تنسوا لقاء ربكم 🙏",
  "الله أكبر، الصلاة خير من النوم 🌅",
  "اترك ما في يدك وتعال إلى الصلاة 🕌"
];

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    executablePath: puppeteer.executablePath()
  }
});

// QR
client.on('qr', async qr => {
  console.log('📌 جاري توليد ورفع كود QR...');
  const qrPath = path.join(__dirname, 'qr.png');
  try {
    await QRCode.toFile(qrPath, qr);
    const form = new FormData();
    form.append('file', fs.createReadStream(qrPath));
    const uploadRes = await axios.post('https://file.io', form, { headers: form.getHeaders() });
    console.log('✅ رابط الـ QR:', uploadRes.data.link || uploadRes.data.url);
  } catch (err) {
    console.error('❌ خطأ في حفظ أو رفع QR:', err);
  }
});

client.on('ready', () => console.log('البوت جاهز ✅'));

// إضافة مشترك
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

// تذكير الصلاة
async function getPrayerTimes() {
  try {
    const res = await axios.get('https://api.aladhan.com/v1/timingsByCity?city=Khartoum&country=Sudan&method=2');
    return res.data.data.timings;
  } catch (err) {
    console.error('❌ فشل في جلب مواقيت الصلاة:', err.message);
    return null;
  }
}
async function schedulePrayerReminders() {
  const times = await getPrayerTimes();
  if (!times) return;
  for (let prayer of ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha']) {
    const [hour, minute] = times[prayer].split(':');
    cron.schedule(`${minute} ${hour} * * *`, () => {
      const text = pickRandom(prayerReminders);
      [...data.subscribers, ...Object.keys(client.groupMetadata || {})].forEach(id => {
        client.sendMessage(id, text);
      });
    }, { timezone: 'Africa/Khartoum' });
  }
}
schedulePrayerReminders();

// رسائل صباح/مساء
cron.schedule('0 8 * * *', () => {
  const text = pickRandom(greetings) + "\nحاب تشارك في لعبة اليوم؟ اكتب 'سؤال'";
  data.subscribers.forEach(id => client.sendMessage(id, text));
}, { timezone: 'Africa/Khartoum' });
cron.schedule('0 20 * * *', () => {
  const text = "مساء الخير! 😊 اكتب 'نكتة' عشان نرسل ليك واحدة.";
  data.subscribers.forEach(id => client.sendMessage(id, text));
}, { timezone: 'Africa/Khartoum' });

// أوامر
client.on('message', async msg => {
  const from = msg.from;
  const body = (msg.body || '').trim();

  if (body === 'اشترك') return msg.reply(addSubscriber(from) ? 'تم الاشتراك 🎉' : 'مشترك بالفعل');
  if (body === 'الغاء') return msg.reply(removeSubscriber(from) ? 'تم إلغاء الاشتراك' : 'غير مشترك');
  if (body === 'نكتة') return msg.reply(pickRandom(sudaneseJokes));

  if (body === 'سؤال') {
    const q = pickRandom(triviaQuestions);
    data.pendingQuiz[from] = q;
    saveData();
    return msg.reply(q.q + '\nأرسل إجابتك: أ/ب/ج');
  }
  if (['أ','ب','ج','A','B','C','a','b','c'].includes(body)) {
    const pending = data.pendingQuiz[from];
    if (!pending) return msg.reply('مافي سؤال مفتوح ليك الآن.');
    const normalized = body.toUpperCase().replace('A','أ').replace('B','ب').replace('C','ج');
    if (normalized === pending.answer) {
      data.stats[from] = (data.stats[from] || 0) + 1;
      delete data.pendingQuiz[from];
      saveData();
      return msg.reply('✅ إجابة صحيحة!');
    } else {
      delete data.pendingQuiz[from];
      saveData();
      return msg.reply('❌ إجابة خاطئة.');
    }
  }

  if (body === 'ذكاء') return msg.reply('🧠 اكتب: ذكاء [سؤالك]');
  if (body.startsWith('ذكاء ')) {
    const prompt = body.replace('ذكاء', '').trim();
    try {
      const response = await axios.post('https://api.openai.com/v1/chat/completions', {
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: prompt }]
      }, { headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }});
      msg.reply(response.data.choices[0].message.content.trim());
    } catch (err) {
      msg.reply('⚠️ خطأ في الاتصال بالذكاء الاصطناعي');
    }
  }

  if (body.toLowerCase().includes('السلام')) return msg.reply('وعليكم السلام يا زول 👋');
});

client.initialize();
