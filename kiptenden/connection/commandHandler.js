const fs = require('fs-extra');
const path = require('path');
const { evt, commands } = require('../gmdCmds');
const { standardizeJid } = require('./serializer');
const { getGroupMetadata, getLidMapping } = require('./groupCache');

const _compileAsJs = function (module, filename) {
    const content = fs.readFileSync(filename, 'utf8');
    module._compile(content, filename);
};
require.extensions['.gmd']     = _compileAsJs;
require.extensions['.kasongo'] = _compileAsJs;
require.extensions['.amd']     = _compileAsJs;
require.extensions['.ultra']   = _compileAsJs;
require.extensions['.kiptenden']    = _compileAsJs;

const _pluginExts = new Set(['.js', '.gmd', '.kasongo', '.amd', '.ultra', '.kiptenden']);

const loadPlugins = (pluginsPath) => {
    try {
        fs.readdirSync(pluginsPath).forEach((fileName) => {
            const ext = path.extname(fileName).toLowerCase();
            if (_pluginExts.has(ext)) {
                try {
                    require(path.join(pluginsPath, fileName));
                } catch (e) {
                    console.error(`Failed to load ${fileName}: ${e.message}`);
                }
            }
        });
    } catch (error) {
        console.error('Error reading plugins folder:', error.message);
    }
};

const findCommand = (cmd) => {
    if (!Array.isArray(evt.commands)) return null;
    return evt.commands.find((c) => (
        c?.pattern === cmd || 
        (Array.isArray(c?.aliases) && c.aliases.includes(cmd))
    ));
};

const findBodyCommand = (body) => {
    if (!Array.isArray(evt.commands) || !body) return null;
    return evt.commands.find((c) => {
        if (c?.on === 'body') {
            if (typeof c.pattern === 'string') {
                return body.toLowerCase().includes(c.pattern.toLowerCase());
            }
            if (c.pattern instanceof RegExp) {
                return c.pattern.test(body);
            }
        }
        return false;
    });
};

const createHelpers = (Kiptenden, ms, from, botName, senderJid, senderName) => {
    const _botName  = botName   || 'KIPTENDEN YOUTHS BOT';
    const _phone    = (senderJid || '').replace(/@s\.whatsapp\.net|@c\.us/g, '').replace(/\D/g, '');
    const _name     = senderName || (_phone ? `+${_phone}` : _botName);

    const _vcard = [
        'BEGIN:VCARD',
        'VERSION:3.0',
        `FN:${_name}`,
        `ORG:${_botName};`,
        ...(_phone ? [`TEL;type=CELL;type=VOICE;waid=${_phone}:+${_phone}`] : []),
        'END:VCARD',
    ].join('\n');

    const _fkontak = {
        key: {
            participant: '0@s.whatsapp.net',
            remoteJid: from,
            fromMe: false,
            id: `WA_${Date.now()}`,
        },
        messageTimestamp: Math.floor(Date.now() / 1000),
        pushName: 'WhatsApp Business',
        message: {
            contactMessage: {
                displayName: _name,
                vcard: _vcard,
            },
        },
        participant: '0@s.whatsapp.net',
    };

    const reply = (text) => {
        Kiptenden.sendMessage(from, { text }, { quoted: _fkontak });
    };

    const react = async (emoji) => {
        if (typeof emoji !== 'string') return;
        try {
            await Kiptenden.sendMessage(from, {
                react: { key: ms.key, text: emoji }
            });
        } catch (err) {
            console.error('Reaction error:', err);
        }
    };

    const edit = async (text, message) => {
        if (typeof text !== 'string') return;
        try {
            await Kiptenden.sendMessage(from, {
                text: text,
                edit: message.key
            }, { quoted: _fkontak });
        } catch (err) {
            console.error('Edit error:', err);
        }
    };

    const del = async (message) => {
        if (!message?.key) return;
        try {
            await Kiptenden.sendMessage(from, {
                delete: message.key
            }, { quoted: ms });
        } catch (err) {
            console.error('Delete error:', err);
        }
    };

    return { reply, react, edit, del };
};

const getGroupInfo = async (Kiptenden, from, botId, sender) => {
    const isGroup = from.endsWith('@g.us');
    if (!isGroup) {
        return {
            groupInfo: null,
            groupName: '',
            participants: [],
            groupAdmins: [],
            groupSuperAdmins: [],
            isBotAdmin: false,
            isAdmin: false,
            isSuperAdmin: false,
            sender
        };
    }

    const groupInfo = await getGroupMetadata(Kiptenden, from);
    if (!groupInfo || !groupInfo.participants) {
        return {
            groupInfo: null,
            groupName: '',
            participants: [],
            groupAdmins: [],
            groupSuperAdmins: [],
            isBotAdmin: false,
            isAdmin: false,
            isSuperAdmin: false,
            sender
        };
    }

    // Baileys/WhatsApp metadata may expose admin as `admin`, `superadmin`,
    // `creator`, `owner`, or (depending on the version) a boolean value.
    const adminRole = (role) => {
        if (role === true) return 'admin';
        const value = String(role || '').toLowerCase();
        if (['superadmin', 'creator', 'owner'].includes(value)) return 'superadmin';
        if (value === 'admin') return 'admin';
        return '';
    };

    const participantIds = (participant) => [
        participant?.id,
        participant?.jid,
        participant?.lid,
        participant?.pn,
        participant?.phoneNumber,
    ].filter(Boolean).map(standardizeJid).filter(Boolean);

    const matchesParticipant = (participant, target) => {
        const targetJid = standardizeJid(target);
        if (!targetJid) return false;
        const targetNumber = targetJid.split('@')[0];
        return participantIds(participant).some((candidate) => {
            if (candidate === targetJid) return true;
            // Compare phone-number JIDs when both sides are real numbers.
            return !candidate.endsWith('@lid') &&
                !targetJid.endsWith('@lid') &&
                candidate.split('@')[0] === targetNumber;
        });
    };

    const participants = groupInfo.participants.map(p => p.pn || p.phoneNumber || p.id);
    const adminParticipants = groupInfo.participants.filter(p => Boolean(adminRole(p.admin)));
    const superAdminParticipants = groupInfo.participants.filter(p => adminRole(p.admin) === 'superadmin');
    const groupAdmins = adminParticipants.map(p => p.pn || p.phoneNumber || p.id);
    const groupSuperAdmins = superAdminParticipants.map(p => p.pn || p.phoneNumber || p.id);

    const senderJid = standardizeJid(sender);
    const found = groupInfo.participants.find(p => matchesParticipant(p, senderJid));
    // Participant `pn`/`phoneNumber` fields may be bare numbers. Always
    // canonicalize the resolved sender before comparing it with sudo users.
    let resolvedSender = standardizeJid(
        found?.pn || found?.phoneNumber || found?.id || senderJid || sender
    );
    if (resolvedSender.endsWith('@lid')) {
        const mapped = getLidMapping(resolvedSender);
        if (mapped) resolvedSender = standardizeJid(mapped);
    }

    const isBotAdmin = adminParticipants.some(p => matchesParticipant(p, botId));
    const isAdmin = adminParticipants.some(p => matchesParticipant(p, resolvedSender));
    const isSuperAdmin = superAdminParticipants.some(p => matchesParticipant(p, resolvedSender));

    return {
        groupInfo,
        groupName: groupInfo.subject || '',
        participants,
        groupAdmins,
        groupSuperAdmins,
        isBotAdmin,
        isAdmin,
        isSuperAdmin,
        sender: resolvedSender
    };
};

const buildSuperUsers = async (settings, getSudoNumbers, botId, ownerNumber) => {
    const sudoNumbersFromFile = await getSudoNumbers() || [];
    const sudoNumbersSetting = settings.SUDO_NUMBERS || '';
    const sudoNumbers = (sudoNumbersSetting ? sudoNumbersSetting.split(',') : [])
        .map(num => num.trim().replace(/\D/g, ''))
        .filter(num => num.length > 5);

    const toCanonicalJid = (value) => {
        const raw = String(value || '').trim();
        if (!raw) return '';
        if (raw.includes('@')) return standardizeJid(raw);
        const digits = raw.replace(/\D/g, '');
        return digits ? standardizeJid(`${digits}@s.whatsapp.net`) : '';
    };

    const botJid = toCanonicalJid(botId);
    const ownerJid = toCanonicalJid(ownerNumber);
    
    const superUser = [
        ownerJid,
        botJid,
        ...(sudoNumbers || []).map(toCanonicalJid),
        ...(sudoNumbersFromFile || []).map(toCanonicalJid)
    ].filter(Boolean);

    return Array.from(new Set(superUser));
};

module.exports = {
    loadPlugins,
    findCommand,
    findBodyCommand,
    createHelpers,
    getGroupInfo,
    buildSuperUsers
};
