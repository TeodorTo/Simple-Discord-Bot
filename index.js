require('dotenv').config();


const { Client, GatewayIntentBits } = require('discord.js');
const fs = require('fs');
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildInvites,
    ],
});

// Конфигурация
const TOKEN = process.env.DISCORD_TOKEN;
const TEACHERS_FILE = 'teachers.json';
const INVITE_FILE = 'trackedInvites.json';

// Инициализация на учители и покани
let teachers = [];
let trackedInvites = {};

// Зареждане на учители
if (fs.existsSync(TEACHERS_FILE)) {
    teachers = JSON.parse(fs.readFileSync(TEACHERS_FILE)).teachers || [];
    console.log(`Заредени ${teachers.length} учителя`);
}

// Зареждане на покани
if (fs.existsSync(INVITE_FILE)) {
    trackedInvites = JSON.parse(fs.readFileSync(INVITE_FILE));
    console.log(`Заредени покани: ${Object.keys(trackedInvites).length}`);
}

const inviteUsesCache = new Map();

client.once('ready', async () => {
    console.log('Ботът е готов!');
    for (const guild of client.guilds.cache.values()) {
        try {
            const guildInvites = await guild.invites.fetch();
            guildInvites.forEach(invite => {
                inviteUsesCache.set(`${guild.id}-${invite.code}`, invite.uses);
            });
            console.log(`Кеширани ${guildInvites.size} покани за сървър ${guild.name}`);
        } catch (err) {
            console.error(`Грешка при зареждане на покани за ${guild.name}:`, err);
        }
    }
});

client.on('inviteCreate', async invite => {
    inviteUsesCache.set(`${invite.guild.id}-${invite.code}`, invite.uses || 0);
    console.log(`Нова покана създадена: ${invite.code} с ${invite.uses || 0} използвания`);
});

client.on('messageCreate', async message => {
    if (message.author.bot) return;

    // Нова команда за помощ
    if (message.content === '!help') {
        const helpMessage = `
**Списък с команди:**

\`!add-teacher @учител Име на роля\`
- **Описание**: Добавя нов учител и свързва роля за неговите ученици.
- **Пример**: \`!add-teacher @Teacher1 Ученик на преподавател 1\`
- **Права**: Изисква разрешение за управление на сървъра.

\`!generate-invite @учител\`
- **Описание**: Създава покана, която автоматично дава ролята на споменатия учител на новоприсъединилите се.
- **Пример**: \`!generate-invite @Teacher1\`
- **Права**: Изисква разрешение за създаване на покани.

\`!create-private-channels\`
- **Описание**: Създава частни канали за всички ученици на всички учители, ако още нямат такива.
- **Пример**: \`!create-private-channels\`
- **Права**: Изисква разрешение за управление на канали.

**Забележки**:
- Увери се, че ролите съществуват в сървъра преди да използваш командите.
- Ботът автоматично създава канал за ученик, когато му бъде добавена роля на учител, и променя името на канала, ако псевдонимът на ученика се промени.
        `;
        message.reply(helpMessage);
    }

    // Нова команда за добавяне на учител
    if (message.content.startsWith('!add-teacher')) {
        if (!message.member.permissions.has('ManageGuild')) {
            return message.reply('Нямаш права да изпълняваш тази команда!');
        }

        const args = message.content.split(' ').slice(1);
        const teacherMention = message.mentions.users.first();
        const roleName = args.slice(1).join(' ');

        if (!teacherMention || !roleName) {
            return message.reply('Употреба: `!add-teacher @учител Име на роля`');
        }

        const teacherId = teacherMention.id;
        if (teachers.some(t => t.id === teacherId)) {
            return message.reply('Този учител вече е добавен!');
        }

        teachers.push({ id: teacherId, role: roleName });
        fs.writeFileSync(TEACHERS_FILE, JSON.stringify({ teachers }, null, 2));
        message.reply(`Добавен учител <@${teacherId}> с роля "${roleName}"`);
    }

    // Генериране на покана за конкретен учител
    if (message.content.startsWith('!generate-invite')) {
        if (!message.member.permissions.has('CreateInstantInvite')) {
            return message.reply('Нямаш права да създаваш покани!');
        }

        const args = message.content.split(' ').slice(1);
        const teacherMention = message.mentions.users.first();
        if (!teacherMention || !teachers.some(t => t.id === teacherMention.id)) {
            return message.reply('Моля, спомени валиден учител (напр. `!generate-invite @учител`)');
        }

        const teacher = teachers.find(t => t.id === teacherMention.id);
        try {
            const invite = await message.channel.createInvite({
                maxAge: 0,
                maxUses: 0,
                unique: true,
            });

            inviteUsesCache.set(`${message.guild.id}-${invite.code}`, invite.uses || 0);
            trackedInvites[invite.code] = { guildId: message.guild.id, role: teacher.role };
            fs.writeFileSync(INVITE_FILE, JSON.stringify(trackedInvites, null, 2));

            console.log(`Създадох линк: ${invite.url} за роля "${teacher.role}"`);
            message.reply(`Ето линк: ${invite.url}\nВсеки, който влезе чрез този линк, ще получи ролята "${teacher.role}".`);
        } catch (err) {
            console.error('Грешка при създаване на покана:', err);
            message.reply('Не можах да създам покана. Провери правата ми!');
        }
    }

    // Създаване на частни канали за всички учители
    if (message.content === '!create-private-channels') {
        if (!message.member.permissions.has('ManageChannels')) {
            return message.reply('Нямаш права да изпълняваш тази команда!');
        }

        const guild = message.guild;
        let createdChannels = 0;

        for (const teacher of teachers) {
            const role = guild.roles.cache.find(r => r.name === teacher.role);
            if (!role) {
                console.log(`Ролята "${teacher.role}" не е намерена!`);
                continue;
            }

            const teacherMember = await guild.members.fetch(teacher.id).catch(() => null);
            if (!teacherMember) continue;

            await guild.members.fetch();
            const membersWithRole = guild.members.cache.filter(m => m.roles.cache.has(role.id) && !m.user.bot);

            for (const member of membersWithRole.values()) {
                const nickname = member.nickname || member.user.username;
                const existingChannel = guild.channels.cache.find(c =>
                    c.name === nickname.toLowerCase() &&
                    c.permissionOverwrites.cache.has(member.id)
                );

                if (!existingChannel) {
                    const channel = await guild.channels.create({
                        name: nickname.toLowerCase(),
                        type: 0,
                        permissionOverwrites: [
                            { id: guild.id, deny: ['ViewChannel'] },
                            { id: teacher.id, allow: ['ViewChannel', 'SendMessages'] },
                            { id: member.id, allow: ['ViewChannel', 'SendMessages'] },
                            { id: client.user.id, allow: ['ViewChannel', 'SendMessages'] }
                        ],
                    });
                    await channel.send(`Здравей, ${member}! Това е нашият личен чат с ${teacherMember.user.username}.`);
                    createdChannels++;
                }
            }
        }

        message.reply(`Готово! Създадени са ${createdChannels} нови канала.`);
    }
});

client.on('guildMemberAdd', async member => {
    const guild = member.guild;
    const newInvites = await guild.invites.fetch();

    let usedInviteCode = null;
    for (const [code, invite] of newInvites) {
        const cacheKey = `${guild.id}-${code}`;
        const cachedUses = inviteUsesCache.get(cacheKey) || 0;
        if (invite.uses > cachedUses) {
            usedInviteCode = code;
            inviteUsesCache.set(cacheKey, invite.uses);
            break;
        }
    }

    if (trackedInvites[usedInviteCode]) {
        const { role } = trackedInvites[usedInviteCode];
        const discordRole = guild.roles.cache.find(r => r.name === role);
        if (discordRole) {
            await member.roles.add(discordRole);
            console.log(`Добавих ролята "${role}" на ${member.user.tag}`);
        }
    }

    newInvites.forEach(invite => {
        inviteUsesCache.set(`${guild.id}-${invite.code}`, invite.uses);
    });
});

client.on('guildMemberUpdate', async (oldMember, newMember) => {
    for (const teacher of teachers) {
        const role = newMember.guild.roles.cache.find(r => r.name === teacher.role);
        if (!role) continue;

        const hadRoleBefore = oldMember.roles.cache.has(role.id);
        const hasRoleNow = newMember.roles.cache.has(role.id);

        if (!hadRoleBefore && hasRoleNow) {
            const teacherMember = await newMember.guild.members.fetch(teacher.id);
            const nickname = newMember.nickname || newMember.user.username;
            const channel = await newMember.guild.channels.create({
                name: nickname.toLowerCase(),
                type: 0,
                permissionOverwrites: [
                    { id: newMember.guild.id, deny: ['ViewChannel'] },
                    { id: teacher.id, allow: ['ViewChannel', 'SendMessages'] },
                    { id: newMember.id, allow: ['ViewChannel', 'SendMessages'] },
                    { id: client.user.id, allow: ['ViewChannel', 'SendMessages'] }
                ],
            });
            channel.send(`Здравей, ${newMember}! Това е нашият личен чат с ${teacherMember.user.username}.`);
        }

        if (oldMember.nickname !== newMember.nickname && hasRoleNow) {
            const oldNickname = (oldMember.nickname || oldMember.user.username).toLowerCase();
            const newNickname = (newMember.nickname || newMember.user.username).toLowerCase();
            const existingChannel = newMember.guild.channels.cache.find(c =>
                c.name === oldNickname &&
                c.permissionOverwrites.cache.has(newMember.id) &&
                c.permissionOverwrites.cache.has(teacher.id)
            );

            if (existingChannel) {
                await existingChannel.setName(newNickname);
            }
        }
    }
});

client.login(TOKEN);