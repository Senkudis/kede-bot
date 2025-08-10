// index.js - ملف البوت النهائي (محدث)
// --- يعتمد على .env لقراءة OPENAI_API_KEY و (اختياري) IMGBB_KEY

require('dotenv').config();
const { Client, LocalAuth } = require('whatsapp-web.js');
const fs = require('fs');
const cron = require('node-cron');
const path = require('path');
const QRCode = require('qrcode');
const axios = require('axios');
const FormData = require('form-data');

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || ''; // ضع مفتاحك هنا في .env
const IMGBB_KEY = process.env.IMGBB_KEY || ''; // اختياري - لو عندك

const DATA_FILE = path.join(__dirname, 'data.json');
let data = { subscribers: [], pendingQuiz: {}, stats: {}, groupStats: {}, pendingGames: {} };

// قراءة البيانات اذا موجودة
if (fs.existsSync(DATA_FILE)) {
  try { data = JSON.parse(fs.readFileSync(DATA_FILE)); } 
  catch (e) { console.error('خطأ في قراءة data.json', e); }
}
function saveData(){ fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2)); }
function pickRandom(arr){ return arr[Math.floor(Math.random() * arr.length)]; }

// نكات حضارية وفكاهة
const jokes = [
  "مرة واحد صاحي بدري وقف يقول: يا رب خلّي فنجان القهوة معاي طول اليوم!",
  "مرّة زول سألني: سر السعادة؟ قلت ليهو: فنجان قهوة وصوت أمك وراحة بال.",
  "المزاج زي الفجر — لو صحّيت عليه تتمنى اليوم كله جميل.",
  "مرة واحد قالي أحبك، قلت: حاضر بس خلّيني أخلص شاي الصباح.",
  "قالوا الدنيا جزئين: قهوة وناس طيبة — خلّينا نضيف جزء: ضحكة مع أحبابك."
];

// ألغاز بسيطة (تريفيا)
const triviaQuestions = [
  { q: "ما هي عاصمة السودان؟\nأ) الخرطوم\nب) أم درمان\nج) الأبيض", answer: "أ" },
  { q: "ما هو النهر الأشهر في السودان؟\nأ) النيل\nب) الدمحله\nج) السنجة", answer: "أ" },
  { q: "ما هو العنصر الذي رمزه H؟\nأ) هيليوم\nب) هيدروجين\nج) هافنيوم", answer: "ب" }
];

// تذكيرات الصلاة — مجموعة من النصوص (15 أو أكثر)
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

// ألعاب: سنديرها عبر pendingGames داخل data
// pendingGames[id] = { type: 'guess', number: 7 } أو { type: 'rps' } إلخ

// تهيئة العميل
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
    ],
    // executablePath: puppeteer.executablePath() // عادة يُترك؛ Railway قد يحتاج إعدادات خاصة
  }
});

let prayerJobs = [];

// رفع QR: إذا عندك IMGBB_KEY نرفع هناك، وإلا نستخدم file.io
client.on('qr', async qr => {
  try {
    console.log('📌 تم توليد QR — جارٍ رفعه...');
    const dataUrl = await QRCode.toDataURL(qr);
    const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');

    if (IMGBB_KEY) {
      // رفع لimgbb (يعطي رابط ثابت)
      const resp = await axios.post(`https://api.imgbb.com/1/upload?key=${IMGBB_KEY}`, {
        image: base64
      }, { headers: { 'Content-Type': 'application/json' }});
      if (resp.data && resp.data.data && resp.data.data.url) {
        console.log('✅ رابط الـ QR (imgbb):', resp.data.data.url);
      } else {
        console.log('❌ فشل رفع imgbb - الاستجابة:', resp.data);
      }
    } else {
      // رفع لfile.io (مؤقت لمرة واحدة)
      const form = new FormData();
      const tmpPath = path.join(__dirname, 'qr_tmp.png');
      fs.writeFileSync(tmpPath, Buffer.from(base64, 'base64'));
      form.append('file', fs.createReadStream(tmpPath));
      const uploadRes = await axios.post('https://file.io', form, { headers: form.getHeaders() });
      if (uploadRes.data && (uploadRes.data.link || uploadRes.data.url)) {
        console.log('✅ رابط الـ QR (file.io):', uploadRes.data.link || uploadRes.data.url);
      } else {
        console.log('❌ فشل رفع file.io - الاستجابة:', uploadRes.data);
      }
      fs.unlinkSync(tmpPath);
    }
  } catch (err) {
    console.error('❌ خطأ أثناء رفع الـ QR:', err.message || err);
  }
});

client.on('ready', () => {
  console.log('✅ البوت جاهز');
  // جدول مواقيت الصلاة لأول مرة عند الإقلاع
  schedulePrayerReminders().catch(e=>console.error(e));
});

// جلب مواقيت الصلاة من Aladhan (الخرطوم)
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

// جدولة تذكيرات الصلاة (ويتم تحديثها يومياً)
async function schedulePrayerReminders() {
  // إيقاف أي مهام سابقة
  prayerJobs.forEach(job => job.stop && job.stop());
  prayerJobs = [];

  const times = await getPrayerTimes();
  if (!times) return;

  const map = { Fajr: 'الفجر', Dhuhr: 'الظهر', Asr: 'العصر', Maghrib: 'المغرب', Isha: 'العشاء' };

  for (const key of Object.keys(map)) {
    const t = times[key]; // شكل: "05:12"
    if (!t) continue;
    const [hourStr, minuteStr] = t.split(':');
    const hour = parseInt(hourStr, 10), minute = parseInt(minuteStr, 10);
    const cronExp = `${minute} ${hour} * * *`; // كل يوم على هذا الوقت
    const job = cron.schedule(cronExp, async () => {
      const text = `${pickRandom(prayerReminders)}\n🕒 ${map[key]} الآن`;
      // إرسال لكل المشتركين
      for (const id of data.subscribers) {
        try { await client.sendMessage(id, text); } catch(e) { /* تجاهل أخطاء الارسال */ }
      }
      // إرسال لكل القروبات المعروفة
      for (const gid of Object.keys(data.groupStats || {})) {
        try { await client.sendMessage(gid, text); } catch(e) { /* تجاهل */ }
      }
    }, { timezone: 'Africa/Khartoum' });
    prayerJobs.push(job);
  }

  // وجدولة تحديث يومي لتوقيت الصلاة عند منتصف الليل (00:05)
  // (نوقف أي مهمة سابقة ثم نعيد جدولة عند الإقلاع)
  // لنرتب أنه يتم إعادة تحميل التوقيت في أول يوم جديد
}
cron.schedule('5 0 * * *', () => {
  schedulePrayerReminders().catch(e => console.error(e));
}, { timezone: 'Africa/Khartoum' });

// helpers
async function getContactNameOrNumber(id) {
  try {
    const contact = await client.getContactById(id);
    return contact.pushname || contact.name || contact.number || id;
  } catch (e) {
    return id;
  }
}

// أحداث استقبال الرسائل
client.on('message', async msg => {
  const from = msg.from; // chat id (user or group)
  const body = (msg.body || '').trim();

  // لو رسالة في جروب - حدّث إحصائيات القروب
  try {
    if (msg.isGroup) {
      const chat = await msg.getChat();
      const groupId = from;
      data.groupStats[groupId] = data.groupStats[groupId] || { messages: {}, createdTimestamp: chat.createdTimestamp || Date.now(), participants: [] };

      // حدّث قائمة المشاركين
      try {
        data.groupStats[groupId].participants = (chat.participants || []).map(p => (p.id && p.id._serialized) ? p.id._serialized : p.id);
      } catch (_) {}

      // من قدّم الرسالة: msg.author (للقروبات) - إذا ما موجود استعمل msg.from
      const authorId = msg.author || msg.from;
      data.groupStats[groupId].messages[authorId] = (data.groupStats[groupId].messages[authorId] || 0) + 1;
      saveData();
    }
  } catch (e) {
    console.error('خطأ تحديث احصائيات القروب:', e);
  }

  // أوامر سريعة
  // الاشتراك
  if (body === 'اشترك') {
    if (!data.subscribers.includes(from)) { data.subscribers.push(from); saveData(); return msg.reply('✅ تم الاشتراك استلام التذكيرات.'); }
    return msg.reply('أنت مشترك بالفعل.');
  }
  if (body === 'الغاء') {
    const i = data.subscribers.indexOf(from);
    if (i !== -1) { data.subscribers.splice(i,1); saveData(); return msg.reply('✅ تم إلغاء الاشتراك.'); }
    return msg.reply('أنت لست مشتركًا.');
  }

  // نكتة
  if (body === 'نكتة') {
    return msg.reply(pickRandom(jokes));
  }

  // العاب: قائمة
  if (body === 'العاب') {
    return msg.reply('🎮 العاب متاحة:\n- العب رقم (حزر رقم 1-10)\n- لغز (سؤال تريفيا)\n- حجر/ورق/مقص لعبة سريعة\nأرسل: "العب رقم" أو "لغز" أو اكتب "حجر" أو "ورق" أو "مقص"');
  }

  // لعبة حزر رقم
  if (body === 'العب رقم' || body === 'حزر رقم') {
    const secret = Math.floor(Math.random()*10) + 1;
    data.pendingGames[from] = { type: 'guess', number: secret, tries: 0 };
    saveData();
    return msg.reply('أنا اخترت رقم من 1 إلى 10. خمّن الآن!');
  }
  // استقبال محاولة التخمين (لو في لعبة مفتوحة)
  if (data.pendingGames[from] && data.pendingGames[from].type === 'guess' && /^(\d+)$/.test(body)) {
    const guess = parseInt(body, 10);
    const game = data.pendingGames[from];
    game.tries = (game.tries || 0) + 1;
    if (guess === game.number) {
      delete data.pendingGames[from];
      saveData();
      return msg.reply(`🎉 رائع! خمّنت الرقم الصحيح (${guess}) بعد ${game.tries} محاولة.`);
    } else {
      saveData();
      return msg.reply(guess < game.number ? 'أعلى من كدا!' : 'أقل من كدا!');
    }
  }

  // لغز / سؤال تريفيا (نسخة من السؤال)
  if (body === 'لغز' || body === 'سؤال') {
    const q = pickRandom(triviaQuestions);
    data.pendingQuiz[from] = q;
    saveData();
    return msg.reply(q.q + '\nأرسل إجابتك: أ/ب/ج');
  }

  // الرد على اجابة التريفيا
  if (['أ','ب','ج','A','B','C','a','b','c'].includes(body)) {
    const pending = data.pendingQuiz[from];
    if (!pending) return msg.reply('ما في سؤال مفتوح لديك. اكتب "سؤال" لبدء واحد.');
    const normalized = body.toUpperCase().replace('A','أ').replace('B','ب').replace('C','ج');
    if (normalized === pending.answer) {
      data.stats[from] = (data.stats[from] || 0) + 1;
      delete data.pendingQuiz[from];
      saveData();
      return msg.reply('✅ ممتاز! إجابة صحيحة.');
    } else {
      delete data.pendingQuiz[from];
      saveData();
      return msg.reply('❌ للأسف زي كدا خطأ. جرّب سؤال تاني؟ اكتب "سؤال"');
    }
  }

  // حجر ورق مقص فورياً
  if (['حجر','ورق','مقص'].includes(body)) {
    const choices = ['حجر','ورق','مقص'];
    const botChoice = pickRandom(choices);
    let result = 'تعادل';
    if (body === botChoice) result = 'تعادل';
    else if (
      (body === 'حجر' && botChoice === 'مقص') ||
      (body === 'ورق' && botChoice === 'حجر') ||
      (body === 'مقص' && botChoice === 'ورق')
    ) result = 'فزت';
    else result = 'خسرت';
    return msg.reply(`أنا اخترت: ${botChoice}\nالنتيجة: ${result}`);
  }

  // أمر إحصائيات القروب (يعمل داخل الجروب فقط)
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

      const reply = `📊 إحصائيات القروب:
📅 تاريخ الإنشاء: ${createdAt}
👥 عدد الأعضاء: ${membersCount}
🏆 الأكثر تفاعلاً: ${topName} — ${topCount} رسالة
😴 الأقل تفاعلاً: ${bottomName} — ${bottomCount} رسالة`;
      return msg.reply(reply);
    } catch (e) {
      console.error('خطأ حساب احصائيات القروب:', e);
      return msg.reply('حدث خطأ أثناء جلب الإحصائيات.');
    }
  }

  // أمر الذكاء الاصطناعي: "ذكاء" أو "ذكاء [سؤالك]"
  if (body === 'ذكاء') return msg.reply('🧠 اكتب: ذكاء [سؤالك] وسأجيبك عبر OpenAI.');
  if (body.startsWith('ذكاء ')) {
    if (!OPENAI_API_KEY) return msg.reply('⚠️ مفتاح OpenAI غير مفعّل. ضع OPENAI_API_KEY في ملف .env.');
    const prompt = body.replace(/^ذكاء\s+/, '').trim();
    if (!prompt) return msg.reply('🧠 اكتب سؤالك بعد "ذكاء"');
    try {
      const resp = await axios.post('https://api.openai.com/v1/chat/completions', {
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: prompt }]
      }, {
        headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' }
      });
      const content = resp.data.choices[0].message.content.trim();
      return msg.reply(content);
    } catch (e) {
      console.error('خطأ OpenAI:', e.response?.data || e.message);
      return msg.reply('⚠️ حدث خطأ أثناء الاتصال بخدمة الذكاء الاصطناعي.');
    }
  }

  // تحية
  if (body.toLowerCase().includes('السلام')) return msg.reply('وعليكم السلام يا زول 👋');
});

client.initialize();
