require('dotenv').config();
const { Client, LocalAuth } = require('whatsapp-web.js');
const fs = require('fs');
const cron = require('node-cron');
const path = require('path');
const QRCode = require('qrcode');
const axios = require('axios');
const FormData = require('form-data');

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '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';
const IMGBB_KEY = process.env.IMGBB_KEY || '8df2f63e10f44cf4f6f7d99382861e76';

const DATA_FILE = path.join(__dirname, 'data.json');
let data = { subscribers: [], pendingQuiz: {}, stats: {}, groupStats: {}, pendingGames: {} };

if (fs.existsSync(DATA_FILE)) {
  try { data = JSON.parse(fs.readFileSync(DATA_FILE)); } 
  catch (e) { console.error('خطأ في قراءة data.json', e); }
}
function saveData(){ fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2)); }
function pickRandom(arr){ return arr[Math.floor(Math.random() * arr.length)]; }

const jokes = [
  "قال ليك في مسطول بكتب مع الأستاذ وكل ما الأستاذ يمسح السبوره يشرط الورقة",
  "مسطول شغال بتاع مرور قبض واحد يفحط قطعة إيصال بثلاثين ألف قام أداه خمسين الف المسطول قالي مامعاي فكه فحط بالعشرين الباقية وتعال.",
  "المزاج زي الفجر — لو صحّيت عليه تتمنى اليوم كله جميل.",
  "مرة واحد قالي أحبك، قلت: حاضر بس خلّيني أخلص شاي الصباح.",
  "قالوا الدنيا جزئين: قهوة وناس طيبة — خلّينا نضيف جزء: ضحكة مع أحبابك."
];

const triviaQuestions = [
  { q: "ما هي عاصمة السودان؟\nأ) الخرطوم\nب) أم درمان\nج) الأبيض", answer: "أ" },
  { q: "ما هو النهر الأشهر في السودان؟\nأ) النيل\nب) الدمحله\nج) السنجة", answer: "أ" },
  { q: "ما هو العنصر الذي رمزه H؟\nأ) هيليوم\nب) هيدروجين\nج) هافنيوم", answer: "ب" }
];

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

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--no-zygote',
      '--single-process',
      '--disable-gpu'
    ]
  }
});

let prayerJobs = [];

// رفع QR على imgbb مباشرة
client.on('qr', async qr => {
  try {
    console.log('📌 تم توليد QR — جارٍ رفعه...');
    const qrPath = path.join(__dirname, 'qr.png');
    await QRCode.toFile(qrPath, qr);

    const form = new FormData();
    form.append('image', fs.createReadStream(qrPath));

    const resp = await axios.post(
      `https://api.imgbb.com/1/upload?key=${IMGBB_KEY}`,
      form,
      { headers: form.getHeaders() }
    );

    if (resp.data && resp.data.data && resp.data.data.url) {
      console.log('✅ رابط الـ QR (imgbb):', resp.data.data.url);
    } else {
      console.log('❌ فشل رفع imgbb - الاستجابة:', resp.data);
    }

    fs.unlinkSync(qrPath);
  } catch (err) {
    console.error('❌ خطأ أثناء رفع الـ QR:', err.message || err);
  }
});

client.on('ready', () => {
  console.log('✅ البوت جاهز');
  schedulePrayerReminders().catch(e=>console.error(e));
});

async function getPrayerTimes() {
  try {
    const res = await axios.get('https://api.aladhan.com/v1/timingsByCity', {
      params: { city: 'Khartoum', country: 'Sudan', method: 2 }
    });
    if (res.data && res.data.data && res.data.data.timings) return res.data.data.timings;
    return null;
  } catch (err) {
    console.error('❌ فشل جلب مواقيت الصلاة:', err.message || err);
    return null;
  }
}

async function schedulePrayerReminders() {
  prayerJobs.forEach(job => job.stop && job.stop());
  prayerJobs = [];

  const times = await getPrayerTimes();
  if (!times) return;

  const map = { Fajr: 'الفجر', Dhuhr: 'الظهر', Asr: 'العصر', Maghrib: 'المغرب', Isha: 'العشاء' };

  for (const key of Object.keys(map)) {
    const t = times[key];
    if (!t) continue;
    const [hourStr, minuteStr] = t.split(':');
    const hour = parseInt(hourStr, 10), minute = parseInt(minuteStr, 10);
    const cronExp = `${minute} ${hour} * * *`;
    const job = cron.schedule(cronExp, async () => {
      const text = `${pickRandom(prayerReminders)}\n🕒 ${map[key]} الآن`;
      for (const id of data.subscribers) {
        try { await client.sendMessage(id, text); } catch(e) {}
      }
      for (const gid of Object.keys(data.groupStats || {})) {
        try { await client.sendMessage(gid, text); } catch(e) {}
      }
    }, { timezone: 'Africa/Khartoum' });
    prayerJobs.push(job);
  }
}

cron.schedule('5 0 * * *', () => {
  schedulePrayerReminders().catch(e => console.error(e));
}, { timezone: 'Africa/Khartoum' });

async function getContactNameOrNumber(id) {
  try {
    const contact = await client.getContactById(id);
    return contact.pushname || contact.name || contact.number || id;
  } catch (e) {
    return id;
  }
}

client.on('message', async msg => {
  const from = msg.from;
  const body = (msg.body || '').trim();

  try {
    if (msg.isGroup) {
      const chat = await msg.getChat();
      const groupId = from;
      data.groupStats[groupId] = data.groupStats[groupId] || { messages: {}, createdTimestamp: chat.createdTimestamp || Date.now(), participants: [] };
      try {
        data.groupStats[groupId].participants = (chat.participants || []).map(p => (p.id && p.id._serialized) ? p.id._serialized : p.id);
      } catch (_) {}
      const authorId = msg.author || msg.from;
      data.groupStats[groupId].messages[authorId] = (data.groupStats[groupId].messages[authorId] || 0) + 1;
      saveData();
    }
  } catch (e) {
    console.error('خطأ تحديث احصائيات القروب:', e);
  }

  if (body === 'اشترك') {
    if (!data.subscribers.includes(from)) { data.subscribers.push(from); saveData(); return msg.reply('✅ تم الاشتراك.'); }
    return msg.reply('أنت مشترك بالفعل.');
  }
  if (body === 'الغاء') {
    const i = data.subscribers.indexOf(from);
    if (i !== -1) { data.subscribers.splice(i,1); saveData(); return msg.reply('✅ تم إلغاء الاشتراك.'); }
    return msg.reply('أنت لست مشتركًا.');
  }

  if (body === 'نكتة') {
    return msg.reply(pickRandom(jokes));
  }

  if (body === 'احصائيات القروب') {
    if (!msg.isGroup) return msg.reply('هذا الأمر يشتغل داخل المجموعات فقط.');
    try {
      const chat = await msg.getChat();
      const groupId = from;
      const stats = data.groupStats[groupId] || { messages: {} };
      const membersCount = (chat.participants || []).length;
      const createdAt = chat.createdTimestamp ? new Date(chat.createdTimestamp).toLocaleString('en-GB', { timeZone: 'Africa/Khartoum' }) : 'غير متوفر';
      const entries = Object.entries(stats.messages || {});
      if (entries.length === 0) {
        return msg.reply(`📊 إحصائيات القروب:\n📅 تاريخ الإنشاء: ${createdAt}\n👥 عدد الأعضاء: ${membersCount}\nلا توجد بيانات تفاعل بعد.`);
      }
      const sorted = entries.sort((a,b) => b[1] - a[1]);
      const topId = sorted[0][0], topCount = sorted[0][1];
      const bottomEntry = sorted[sorted.length - 1] || [null,0];
      const bottomId = bottomEntry[0], bottomCount = bottomEntry[1];

      const topName = await getContactNameOrNumber(topId);
      const bottomName = bottomId ? await getContactNameOrNumber(bottomId) : 'لا يوجد';

      return msg.reply(`📊 إحصائيات القروب:
📅 تاريخ الإنشاء: ${createdAt}
👥 عدد الأعضاء: ${membersCount}
🏆 الأكثر تفاعلاً: ${topName} — ${topCount} رسالة
😴 الأقل تفاعلاً: ${bottomName} — ${bottomCount} رسالة`);
    } catch (e) {
      console.error('خطأ حساب احصائيات القروب:', e);
      return msg.reply('حدث خطأ أثناء جلب الإحصائيات.');
    }
  }
});

client.initialize();
