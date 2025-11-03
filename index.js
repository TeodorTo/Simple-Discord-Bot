require('dotenv').config();

const anyDeskWindows = "https://anydesk.com/en/downloads/thank-you?dv=win_exe";
const anyDeskMac = "https://anydesk.com/en/downloads/thank-you?dv=mac_dmg";
const anyDeskLinux = "https://anydesk.com/en/downloads/linux";

const visualStudio = "https://visualstudio.microsoft.com/thank-you-downloading-visual-studio/?sku=Community&channel=Release&version=VS2022&source=VSLandingPage&cid=2030&passive=false";
const visualStudioCode = "https://code.visualstudio.com/Download";
const intelliJIdea = "https://lp.jetbrains.com/intellij-idea-promo/?source=google&medium=cpc&campaign=EMEA_en_EAST_IDEA_Branded&term=intellij%20idea&content=693349187757&gad_source=1&gad_campaignid=9736965301&gclid=CjwKCAiAwqHIBhAEEiwAx9cTeblqI2Aan8i9W6hpUpapDUljY2tpxlIBY98frPTkK-igZ1czMJjN1RoCg-oQAvD_BwE";
const pyCharm = "https://www.jetbrains.com/pycharm/";

const { 
    Client, 
    GatewayIntentBits, 
    ChannelType, 
    PermissionFlagsBits 
} = require('discord.js');
const fs = require('fs');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildInvites,
        GatewayIntentBits.GuildVoiceStates,
		GatewayIntentBits.DirectMessages,
    ],
	partials: ['CHANNEL'],
});

// Конфигурация
const TOKEN = process.env.DISCORD_TOKEN;
const TEACHERS_FILE = 'teachers.json';
const INVITE_FILE = 'trackedInvites.json';
const TEMP_CATEGORY_ID = null; // Ако искаш да сложиш временните канали в категория

// Инициализация
let teachers = [];
let trackedInvites = {};
let specialChannelId = null; // ID на специалния "Join to Create VC"
const inviteUsesCache = new Map();

// Следене на нови членове за автоматично напомняне
const newMemberTimeouts = new Map();

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

// Стартиране
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

// Събитие за нова покана
client.on('inviteCreate', async invite => {
    inviteUsesCache.set(`${invite.guild.id}-${invite.code}`, invite.uses || 0);
    console.log(`Нова покана: ${invite.code} с ${invite.uses || 0} използвания`);
});

// Събитие за съобщения
client.on('messageCreate', async message => {
    if (message.author.bot) return;

    // ==== !help ====
    if (message.content === '!help') {
        const helpMessage = `
**Списък с команди:**

\`!add-teacher @учител Име на роля\`
- Добавя нов учител и свързва роля за учениците.

\`!update-teacher-role @учител НоваРоля\`
- Променя ролята на учител без да го премахваш.

\`!list-teachers\`
- Показва всички добавени учители и техните роли.

\`!remove-teacher @учител\` или \`!remove-teacher ИмеНаРоля\`
- Премахва даден учител от списъка.

\`!generate-invite @учител\`
- Създава покана, която автоматично дава ролята на споменатия учител.

\`!create-private-channels\`
- Създава частни канали за ученици на всички учители.

\`!setup-vc\`
- Създава специалния канал "Join to Create VC".
        `;
        return message.reply(helpMessage);
    }

    // ==== !add-teacher ====
    if (message.content.startsWith('!add-teacher')) {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) 
            return message.reply('Нямаш права да изпълняваш тази команда!');

        const args = message.content.split(' ').slice(1);
        const teacherMention = message.mentions.users.first();
        const roleName = args.slice(1).join(' ');

        if (!teacherMention || !roleName) 
            return message.reply('Употреба: `!add-teacher @учител Име на роля`');

        const teacherId = teacherMention.id;
        if (teachers.some(t => t.id === teacherId)) 
            return message.reply('Този учител вече е добавен!');

        teachers.push({ id: teacherId, role: roleName });
        fs.writeFileSync(TEACHERS_FILE, JSON.stringify({ teachers }, null, 2));
        message.reply(`Добавен учител <@${teacherId}> с роля "${roleName}"`);
    }

    // ==== !update-teacher-role ====
    if (message.content.startsWith('!update-teacher-role')) {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild))
            return message.reply('Нямаш права да изпълняваш тази команда!');

        const args = message.content.split(' ').slice(1);
        const teacherMention = message.mentions.users.first();
        const newRole = args.slice(1).join(' ');

        if (!teacherMention || !newRole)
            return message.reply('Употреба: `!update-teacher-role @учител НоваРоля`');

        const teacher = teachers.find(t => t.id === teacherMention.id);
        if (!teacher)
            return message.reply('Този учител не е намерен!');

        teacher.role = newRole;
        fs.writeFileSync(TEACHERS_FILE, JSON.stringify({ teachers }, null, 2));
        message.reply(`✅ Ролята на <@${teacher.id}> беше променена на "${newRole}"`);
    }

    // ==== !list-teachers ====
    if (message.content === '!list-teachers') {
        if (teachers.length === 0) 
            return message.reply('❌ Все още няма добавени учители.');

        let teacherList = teachers
            .map((t, i) => `**${i + 1}.** <@${t.id}> — Роля: \`${t.role}\``)
            .join('\n');

        message.reply(`📚 **Списък с учители:**\n${teacherList}`);
    }

    // ==== !remove-teacher ====
    if (message.content.startsWith('!remove-teacher')) {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) 
            return message.reply('Нямаш права да изпълняваш тази команда!');

        const args = message.content.split(' ').slice(1);
        const teacherMention = message.mentions.users.first();
        const roleName = teacherMention ? null : args.join(' ');

        if (!teacherMention && !roleName)
            return message.reply('Употреба: `!remove-teacher @учител` или `!remove-teacher ИмеНаРоля`');

        let removed;
        if (teacherMention) {
            const teacherId = teacherMention.id;
            const teacherIndex = teachers.findIndex(t => t.id === teacherId);
            if (teacherIndex === -1)
                return message.reply('❌ Този учител не е намерен в списъка.');
            removed = teachers.splice(teacherIndex, 1)[0];
        } else {
            const teacherIndex = teachers.findIndex(t => t.role.toLowerCase() === roleName.toLowerCase());
            if (teacherIndex === -1)
                return message.reply(`❌ Не е намерен учител с роля "${roleName}".`);
            removed = teachers.splice(teacherIndex, 1)[0];
        }

        fs.writeFileSync(TEACHERS_FILE, JSON.stringify({ teachers }, null, 2));
        message.reply(`✅ Учител <@${removed.id}> с роля "${removed.role}" беше премахнат.`);
    }

    // ==== !generate-invite ====
    if (message.content.startsWith('!generate-invite')) {
        if (!message.member.permissions.has(PermissionFlagsBits.CreateInstantInvite))
            return message.reply('Нямаш права да създаваш покани!');

        const teacherMention = message.mentions.users.first();
        if (!teacherMention || !teachers.some(t => t.id === teacherMention.id))
            return message.reply('Моля, спомени валиден учител.');

        const teacher = teachers.find(t => t.id === teacherMention.id);
        try {
            const invite = await message.channel.createInvite({ maxAge: 0, maxUses: 0, unique: true });
            inviteUsesCache.set(`${message.guild.id}-${invite.code}`, invite.uses || 0);
            trackedInvites[invite.code] = { guildId: message.guild.id, role: teacher.role };
            fs.writeFileSync(INVITE_FILE, JSON.stringify(trackedInvites, null, 2));
            message.reply(`Ето линк: ${invite.url}. Ролята "${teacher.role}" ще се добавя автоматично.`);
        } catch (err) {
            console.error(err);
            message.reply('Не можах да създам покана.');
        }
    }

    // ==== !create-private-channels ====
    if (message.content === '!create-private-channels') {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) 
            return message.reply('Нямаш права да изпълняваш тази команда!');

        const guild = message.guild;
        let createdChannels = 0;

        for (const teacher of teachers) {
            const role = guild.roles.cache.find(r => r.name === teacher.role);
            if (!role) continue;
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
                        type: ChannelType.GuildText,
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
        message.reply(`Създадени са ${createdChannels} нови канала.`);
    }


// ==== !msg-role ====
    if (message.content.startsWith('!msg-role')) {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages))
            return message.reply('Нямаш права да изпълняваш тази команда!');

        const mentionedRole = message.mentions.roles.first();
        const args = message.content.split(' ').slice(1);
        const textStartIndex = args.findIndex(arg => arg.includes('<@&'));
        const textToSend = args.slice(textStartIndex + 1).join(' ');

        if (!mentionedRole || !textToSend)
            return message.reply('Употреба: `!msg-role @Роля ТекстНаСъобщението`');

        const guild = message.guild;
        const role = mentionedRole;

        await guild.members.fetch(); // за да сме сигурни, че имаме всички членове
        const membersWithRole = guild.members.cache.filter(m => m.roles.cache.has(role.id) && !m.user.bot);

        if (membersWithRole.size === 0)
            return message.reply(`❌ Няма потребители с роля "${role.name}".`);

        let sentCount = 0;

        for (const member of membersWithRole.values()) {
            const nickname = (member.nickname || member.user.username).toLowerCase();

            const privateChannel = guild.channels.cache.find(c =>
                c.name === nickname &&
                c.permissionOverwrites.cache.has(member.id)
            );

            if (privateChannel) {
                await privateChannel.send(`📢 <@&${role.id}> — ${textToSend}`);
                sentCount++;
            }
        }

        message.reply(`✅ Съобщението беше изпратено в ${sentCount} частни канала на ролята "${role.name}".`);
    }


    // ==== !setup-vc ====
    if (message.content === '!setup-vc') {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels))
            return message.reply('Нямаш права за това!');

        try {
            const channel = await message.guild.channels.create({
                name: '➕ Join to Create VC',
                type: ChannelType.GuildVoice,
                parent: TEMP_CATEGORY_ID || undefined,
                permissionOverwrites: [
                    { id: message.guild.id, allow: [PermissionFlagsBits.Connect, PermissionFlagsBits.ViewChannel] },
                    { id: client.user.id, allow: [PermissionFlagsBits.ManageChannels, PermissionFlagsBits.MoveMembers] },
                ],
            });
            specialChannelId = channel.id;
            message.reply(`Създаден е специалният канал: ${channel.name}.`);
        } catch (err) {
            console.error(err);
            message.reply('Грешка при създаването на канала.');
        }
    }
});

// ==== Логика за Join-to-Create VC ====
client.on('voiceStateUpdate', async (oldState, newState) => {
    try {
        if (newState.channelId === specialChannelId) {
            const guild = newState.guild;
            const member = newState.member;
			const nickname = member.nickname || member.user.username;

            const tempChannel = await guild.channels.create({
                name: `${nickname}'s VC`,
                type: ChannelType.GuildVoice,
                parent: TEMP_CATEGORY_ID || undefined,
            });

            await member.voice.setChannel(tempChannel);
        }

        if (
            oldState.channel &&
            oldState.channel.id !== specialChannelId &&
            oldState.channel.type === ChannelType.GuildVoice &&
            oldState.channel.members.size === 0 &&
            oldState.channel.name.endsWith("'s VC")
        ) {
            await oldState.channel.delete().catch(() => {});
        }
    } catch (err) {
        console.error('VoiceStateUpdate Error:', err);
    }
});

// ==== Логика за покани ====
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
        if (discordRole) await member.roles.add(discordRole);
    }

    newInvites.forEach(invite => {
        inviteUsesCache.set(`${guild.id}-${invite.code}`, invite.uses);
    });

    // ==== АВТОМАТИЧНО НАПОМНЯНЕ ЗА НОВИ ЧЛЕНОВЕ ====
    try {
        await member.send('👋 Добре дошъл! Моля, напиши своето име и фамилия (напр. "Иван Иванов") в рамките на 10 минути:');
        await member.send('Изпращам ти линкове към програмите които ще са ти нужни за да проведем обучението без проблеми!:');
        await member.send(`AnyDesk: Windows - ${anyDeskWindows} ,MacOS - ${anyDeskMac} , Linux - ${anyDeskLinux}`);
        await member.send(`Според това на какъв език ще се обучавате ,моля изтеглете съответното IDE:`);
        await member.send(`C#/C++/C - ${visualStudio}, JavaScript - ${visualStudioCode}, Java - ${intelliJIdea}, Python - ${pyCharm}` );

        const dmChannel = await member.createDM();

        const timeout = setTimeout(async () => {
            try {
                await dmChannel.send('⚠️ Напомняне: Все още не си написал името си. Моля, направи го, за да можем да те добавим правилно в сървъра!');
            } catch (err) {
                console.error('Не мога да изпратя напомняне на нов член:', err);
            }
        }, 10 * 60 * 1000); // 10 минути

        newMemberTimeouts.set(member.id, timeout);

        const collected = await dmChannel.awaitMessages({
            max: 1,
            time: 600000, // 10 минути
            errors: ['time']
        });

        const fullName = collected.first().content.trim();
        await member.setNickname(fullName);
        await dmChannel.send(`✅ Псевдонимът ти беше зададен на: **${fullName}**`);

        clearTimeout(newMemberTimeouts.get(member.id));
        newMemberTimeouts.delete(member.id);

    } catch (error) {
        console.error('Грешка при задаване на псевдоним:', error);
        try {
            await member.send('⚠️ Не успях да променя псевдонима ти.');
        } catch {}
    }
});

// ==== Логика за частни канали при смяна на роля/никнейм ====
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
                type: ChannelType.GuildText,
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

            if (existingChannel) await existingChannel.setName(newNickname);
        }
    }
});

client.login(TOKEN);
