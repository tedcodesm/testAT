import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from 'url';
import africastalking from 'africastalking';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── Initialize Africa's Talking ────────────────────
console.log('AT_USERNAME:', process.env.AT_USERNAME);
console.log('AT_API_KEY exists:', process.env.AT_API_KEY ? 'YES' : 'NO');

const africasTalking = africastalking({
  username: process.env.AT_USERNAME || 'sandbox',
  apiKey: process.env.AT_API_KEY
});

const sms = africasTalking.SMS;

// ─── SMS Service ─────────────────────────────────────
class SMSService {
  static async sendSMS(phoneNumber, message, options = {}) {
    try {
      // Format phone number — Africa's Talking needs +254XXXXXXXXX format
      let formattedPhone = phoneNumber.trim();
      if (!formattedPhone.startsWith('+')) {
        formattedPhone = '+' + formattedPhone.replace(/^0+/, '');
      }
      // Ensure it starts with +254
      if (!formattedPhone.startsWith('+254')) {
        formattedPhone = '+254' + formattedPhone.replace(/^\+/, '').replace(/^0+/, '');
      }

      if (!formattedPhone || formattedPhone.length < 13) {
        console.error('Invalid phone number:', formattedPhone);
        return null;
      }

      const finalPhone = formattedPhone;

      console.log('Sending SMS to:', finalPhone, 'Message:', message);

      const result = await sms.send({
        to: [finalPhone],
        message: message,
      });

      console.log('SMS API result:', JSON.stringify(result, null, 2));

      // Log SMS in our system
      await SMSService.logSMS(finalPhone, message, 'sent', result);

      return result;
    } catch (error) {
      const atData = error.response?.data || null;
      console.error('SMS sending failed:', JSON.stringify(atData || error.message, null, 2));
      // Log failed SMS attempt
      await SMSService.logSMS(phoneNumber, message, 'failed', { error: atData || error.message });
      return null;
    }
  }

  static async sendBulkSMS(phoneNumbers, message, options = {}) {
    try {
      const formattedNumbers = phoneNumbers
        .map(num => {
          let n = num.trim();
          if (!n.startsWith('+')) n = '+' + n.replace(/^0+/, '');
          if (!n.startsWith('+254')) n = '+254' + n.replace(/^\+/, '').replace(/^0+/, '');
          return n;
        })
        .filter(num => num.length >= 13);

      if (formattedNumbers.length === 0) {
        console.error('No valid phone numbers to send SMS');
        return null;
      }

      const result = await sms.send({
        to: formattedNumbers,
        message: message,
      });

      console.log(`Bulk SMS sent to ${formattedNumbers.length} recipients`);
      
      // Log each SMS in the bulk send
      for (const phone of formattedNumbers) {
        await SMSService.logSMS(phone, message, 'sent_bulk', result);
      }

      return result;
    } catch (error) {
      console.error('Bulk SMS sending failed:', error);
      return null;
    }
  }

  static async logSMS(phone, message, status, response) {
    try {
      const logEntry = {
        phone,
        message,
        status,
        response,
        timestamp: Date.now()
      };

      // Load existing SMS logs
      const logsPath = path.join(__dirname, 'data', 'sms_logs.json');
      let logs = [];
      try {
        const data = await fs.readFile(logsPath, 'utf-8');
        logs = JSON.parse(data);
      } catch (error) {
        // File doesn't exist yet
      }

      // Keep only last 1000 logs
      logs.push(logEntry);
      if (logs.length > 1000) {
        logs = logs.slice(-1000);
      }

      await fs.writeFile(logsPath, JSON.stringify(logs, null, 2), 'utf-8');
    } catch (error) {
      console.error('Failed to log SMS:', error);
    }
  }

  // ─── Notification Templates ────────────────────────────

  static getExchangeRequestTemplate(borrowerName, toolName, days, exchangeId) {
    return `🔧 JuaKali Link: ${borrowerName} requested your ${toolName} for ${days} day(s). 
Reply via USSD or app to accept/decline. 
Exchange ID: ${exchangeId}`;
  }

  static getExchangeAcceptedTemplate(toolName, ownerPhone, exchangeId) {
    return `✅ JuaKali Link: Your request for ${toolName} was ACCEPTED! 
Contact owner: ${ownerPhone}
Exchange ID: ${exchangeId}
Please arrange pickup.`;
  }

  static getExchangeDeclinedTemplate(toolName, exchangeId) {
    return `❌ JuaKali Link: Your request for ${toolName} was DECLINED. 
Search for alternatives via USSD.
Exchange ID: ${exchangeId}`;
  }

  static getEmergencyTemplate(requesterName, tool, description, location, radius) {
    return `🚨 JUA KALI EMERGENCY! 
${requesterName} needs a ${tool} urgently.
Description: ${description}
Location: ${location}
Radius: ${radius}km
Dial *384*# to respond if you can help.`;
  }

  static getEmergencyFollowUpTemplate(tool, requesterName, location) {
    return `⏰ REMINDER: Emergency request for ${tool} by ${requesterName} at ${location} is still active. 
Please respond via USSD if you can help.`;
  }

  static getCallbackRequestTemplate() {
    return `📞 JuaKali Link: We've received your callback request. 
Our support team will contact you within 24 hours.
Thank you for using JuaKali Link!`;
  }
}

// ─── Data Storage Layer ─────────────────────────────
class DataStore {
  constructor() {
    this.dataPath = path.join(__dirname, 'data');
    this.files = {
      artisans: 'artisans.json',
      tools: 'tools.json',
      exchanges: 'exchanges.json',
      sessions: 'sessions.json',
      emergencies: 'emergencies.json',
      config: 'config.json',
      sms_logs: 'sms_logs.json'
    };
    this.cache = {};
    this.initialize();
  }

  async initialize() {
    try {
      await fs.mkdir(this.dataPath, { recursive: true });
      for (const [key, file] of Object.entries(this.files)) {
        const filePath = path.join(this.dataPath, file);
        try {
          await fs.access(filePath);
        } catch {
          // Initialize with default data
          await this.saveData(key, this.getDefaultData(key));
        }
      }
      // Load all data into cache
      await this.loadAllData();
    } catch (error) {
      console.error('Failed to initialize data store:', error);
    }
  }

  getDefaultData(key) {
    const defaults = {
      artisans: {
        "254700111111": {
          id: "ART-001",
          phone: "254700111111",
          name: "Otieno Welding",
          trade: "Welder",
          location: "Kariobangi, near St. Peters Church",
          lat: -1.2545,
          lng: 36.8825,
          experience: 5,
          certifications: "",
          approved: true,
          ratings: [4, 5, 5],
          createdAt: Date.now()
        },
        "254700222222": {
          id: "ART-002",
          phone: "254700222222",
          name: "Mama Njeri Tailoring",
          trade: "Tailor",
          location: "Gikomba Market, Section 3",
          lat: -1.2841,
          lng: 36.8312,
          experience: 8,
          certifications: "",
          approved: true,
          ratings: [3, 4],
          createdAt: Date.now()
        }
      },
      tools: {
        1: {
          id: 1,
          ownerPhone: "254700111111",
          name: "Pipe Bender",
          description: "Heavy duty pipe bender, manual",
          condition: "good",
          price: 600,
          deposit: 1000,
          available: true,
          history: [],
          createdAt: Date.now()
        },
        2: {
          id: 2,
          ownerPhone: "254700111111",
          name: "Welding Machine",
          description: "Arc welder, 200A",
          condition: "good",
          price: 800,
          deposit: 2000,
          available: true,
          history: [],
          createdAt: Date.now()
        }
      },
      exchanges: {},
      sessions: {},
      emergencies: [],
      sms_logs: [],
      config: {
        nextArtisanId: 3,
        nextToolId: 3,
        nextExchangeId: 1,
        trades: ["Welder", "Carpenter", "Mechanic", "Tailor", "Electrician"],
        lastBackup: null
      }
    };
    return defaults[key] || {};
  }

  async loadAllData() {
    for (const key of Object.keys(this.files)) {
      try {
        const data = await this.loadData(key);
        this.cache[key] = data;
      } catch (error) {
        console.error(`Failed to load ${key}:`, error);
        this.cache[key] = this.getDefaultData(key);
      }
    }
  }

  async loadData(key) {
    const filePath = path.join(this.dataPath, this.files[key]);
    try {
      const data = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      return this.getDefaultData(key);
    }
  }

  async saveData(key, data) {
    const filePath = path.join(this.dataPath, this.files[key]);
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
    this.cache[key] = data;
  }

  getData(key) {
    return this.cache[key] || this.getDefaultData(key);
  }

  async updateData(key, updates) {
    const data = this.getData(key);
    const updated = { ...data, ...updates };
    await this.saveData(key, updated);
    return updated;
  }

  async backup() {
    const timestamp = Date.now();
    const backupDir = path.join(__dirname, 'backups', String(timestamp));
    await fs.mkdir(backupDir, { recursive: true });
    
    for (const [key, file] of Object.entries(this.files)) {
      const data = this.getData(key);
      const backupPath = path.join(backupDir, file);
      await fs.writeFile(backupPath, JSON.stringify(data, null, 2), 'utf-8');
    }
    
    const config = this.getData('config');
    await this.updateData('config', { ...config, lastBackup: timestamp });
    return timestamp;
  }

  // Auto-backup every hour
  startAutoBackup() {
    setInterval(async () => {
      try {
        await this.backup();
        console.log('Auto-backup completed');
      } catch (error) {
        console.error('Auto-backup failed:', error);
      }
    }, 3600000); // 1 hour
  }
}

const store = new DataStore();
store.startAutoBackup();

// ─── Data Access Layer ─────────────────────────────
class DataAccess {
  // Artisan operations
  static async getArtisans() {
    return store.getData('artisans');
  }

  static async getArtisan(phone) {
    const artisans = await this.getArtisans();
    return artisans[phone] || null;
  }

  static async createArtisan(phone, data) {
    const artisans = await this.getArtisans();
    const config = store.getData('config');
    const id = `ART-${String(config.nextArtisanId).padStart(3, "0")}`;
    
    artisans[phone] = {
      id,
      phone,
      ...data,
      createdAt: Date.now()
    };
    
    await store.updateData('config', { 
      ...config, 
      nextArtisanId: config.nextArtisanId + 1 
    });
    await store.saveData('artisans', artisans);
    return artisans[phone];
  }

  static async updateArtisan(phone, updates) {
    const artisans = await this.getArtisans();
    if (!artisans[phone]) return null;
    artisans[phone] = { ...artisans[phone], ...updates };
    await store.saveData('artisans', artisans);
    return artisans[phone];
  }

  static async addRating(phone, rating) {
    const artisan = await this.getArtisan(phone);
    if (!artisan) return null;
    artisan.ratings.push(rating);
    await this.updateArtisan(phone, artisan);
    return artisan;
  }

  // Tool operations
  static async getTools() {
    return store.getData('tools');
  }

  static async getTool(id) {
    const tools = await this.getTools();
    return tools[id] || null;
  }

  static async createTool(data) {
    const tools = await this.getTools();
    const config = store.getData('config');
    const id = config.nextToolId++;
    
    tools[id] = {
      id,
      ...data,
      available: true,
      history: [],
      createdAt: Date.now()
    };
    
    await store.updateData('config', config);
    await store.saveData('tools', tools);
    return tools[id];
  }

  static async updateTool(id, updates) {
    const tools = await this.getTools();
    if (!tools[id]) return null;
    tools[id] = { ...tools[id], ...updates };
    await store.saveData('tools', tools);
    return tools[id];
  }

  static async getToolsByOwner(phone) {
    const tools = await this.getTools();
    return Object.values(tools).filter(t => t.ownerPhone === phone);
  }

  // Exchange operations
  static async getExchanges() {
    return store.getData('exchanges');
  }

  static async getExchange(id) {
    const exchanges = await this.getExchanges();
    return exchanges[id] || null;
  }

  static async createExchange(data) {
    const exchanges = await this.getExchanges();
    const config = store.getData('config');
    const id = `EX-${config.nextExchangeId++}`;
    
    exchanges[id] = {
      id,
      ...data,
      status: 'requested',
      createdAt: Date.now()
    };
    
    await store.updateData('config', config);
    await store.saveData('exchanges', exchanges);
    
    // ─── Send SMS notification to tool owner ───
    try {
      const tool = await this.getTool(data.toolId);
      const owner = await this.getArtisan(tool.ownerPhone);
      const borrower = await this.getArtisan(data.borrowerPhone);
      
      // Send SMS to tool owner
      const message = SMSService.getExchangeRequestTemplate(
        borrower ? borrower.name : data.borrowerName,
        tool.name,
        data.days,
        id
      );
      
      // Send SMS asynchronously (don't wait for response)
      SMSService.sendSMS(tool.ownerPhone, message)
        .then(result => {
          console.log(`Exchange request SMS sent to ${tool.ownerPhone}`);
        })
        .catch(error => {
          console.error('Failed to send exchange request SMS:', error);
        });
      
      // Also log the notification
      console.log(`Exchange request created: ${id} for ${tool.name}`);
      
    } catch (error) {
      console.error('Failed to send exchange notification SMS:', error);
    }
    
    return exchanges[id];
  }

  static async updateExchange(id, updates) {
    const exchanges = await this.getExchanges();
    if (!exchanges[id]) return null;
    
    const oldStatus = exchanges[id].status;
    exchanges[id] = { ...exchanges[id], ...updates };
    await store.saveData('exchanges', exchanges);
    
    // ─── Send SMS notifications based on status change ───
    if (updates.status && updates.status !== oldStatus) {
      const exchange = exchanges[id];
      const tool = await this.getTool(exchange.toolId);
      const borrower = await this.getArtisan(exchange.borrowerPhone);
      const owner = await this.getArtisan(exchange.ownerPhone);
      
      try {
        switch (updates.status) {
          case 'accepted':
            // Notify borrower
            const acceptMessage = SMSService.getExchangeAcceptedTemplate(
              tool.name,
              owner ? owner.phone : exchange.ownerPhone,
              id
            );
            SMSService.sendSMS(exchange.borrowerPhone, acceptMessage)
              .then(() => console.log(`Exchange accepted SMS sent to ${exchange.borrowerPhone}`))
              .catch(err => console.error('Failed to send acceptance SMS:', err));
            break;
            
          case 'declined':
            // Notify borrower
            const declineMessage = SMSService.getExchangeDeclinedTemplate(
              tool.name,
              id
            );
            SMSService.sendSMS(exchange.borrowerPhone, declineMessage)
              .then(() => console.log(`Exchange declined SMS sent to ${exchange.borrowerPhone}`))
              .catch(err => console.error('Failed to send decline SMS:', err));
            break;
            
          case 'completed':
            // Optional: Send completion notification
            const completeMessage = `✅ JuaKali Link: Exchange ${id} for ${tool.name} is complete! 
Please rate the exchange via USSD to help other users.`;
            SMSService.sendSMS(exchange.borrowerPhone, completeMessage)
              .then(() => console.log(`Exchange completion SMS sent to ${exchange.borrowerPhone}`))
              .catch(err => console.error('Failed to send completion SMS:', err));
            break;
        }
      } catch (error) {
        console.error('Failed to send exchange status update SMS:', error);
      }
    }
    
    return exchanges[id];
  }

  static async getExchangesByUser(phone) {
    const exchanges = await this.getExchanges();
    return Object.values(exchanges).filter(
      e => e.ownerPhone === phone || e.borrowerPhone === phone
    );
  }

  // Session operations
  static async getSession(phone) {
    const sessions = store.getData('sessions');
    // Clean old sessions (older than 1 hour)
    const now = Date.now();
    for (const [key, session] of Object.entries(sessions)) {
      if (now - (session.lastActivity || 0) > 3600000) {
        delete sessions[key];
      }
    }
    await store.saveData('sessions', sessions);
    return sessions[phone] || {};
  }

  static async updateSession(phone, data) {
    const sessions = store.getData('sessions');
    sessions[phone] = {
      ...sessions[phone],
      ...data,
      lastActivity: Date.now()
    };
    await store.saveData('sessions', sessions);
    return sessions[phone];
  }

  static async clearSession(phone) {
    const sessions = store.getData('sessions');
    delete sessions[phone];
    await store.saveData('sessions', sessions);
  }

  // Emergency operations
  static async getEmergencies() {
    return store.getData('emergencies');
  }

  static async createEmergency(data) {
    const emergencies = await this.getEmergencies();
    const id = `EMG-${emergencies.length + 1}`;
    const emergency = {
      id,
      ...data,
      createdAt: Date.now(),
      expiresAt: Date.now() + 2 * 60 * 60 * 1000, // 2 hours
      notificationsSent: false
    };
    emergencies.push(emergency);
    await store.saveData('emergencies', emergencies);
    
    // ─── Send emergency broadcast SMS ───
    try {
      const allArtisans = await this.getArtisans();
      const requester = data.requester;
      
      // Find nearby artisans
      const nearbyArtisans = Object.values(allArtisans).filter(a =>
        a.phone !== requester.phone &&
        BusinessLogic.distanceKm(requester.lat, requester.lng, a.lat, a.lng) <= data.radius
      );
      
      if (nearbyArtisans.length > 0) {
        const message = SMSService.getEmergencyTemplate(
          requester.name,
          data.tool,
          data.description,
          requester.location,
          data.radius
        );
        
        // Send bulk SMS to all nearby artisans
        const phoneNumbers = nearbyArtisans.map(a => a.phone);
        SMSService.sendBulkSMS(phoneNumbers, message)
          .then(result => {
            console.log(`Emergency broadcast sent to ${phoneNumbers.length} artisans`);
            // Update emergency record
            emergency.notificationsSent = true;
            emergency.notifiedCount = phoneNumbers.length;
            store.saveData('emergencies', emergencies);
          })
          .catch(error => {
            console.error('Failed to send emergency broadcast:', error);
          });
      } else {
        console.log(`No nearby artisans found for emergency within ${data.radius}km`);
      }
      
    } catch (error) {
      console.error('Failed to send emergency broadcast:', error);
    }
    
    return emergency;
  }

  // Config operations
  static async getConfig() {
    return store.getData('config');
  }

  static async getTrades() {
    const config = await this.getConfig();
    return config.trades || ["Welder", "Carpenter", "Mechanic", "Tailor", "Electrician"];
  }
}

// ─── Business Logic ──────────────────────────────────
class BusinessLogic {
  static distanceKm(lat1, lng1, lat2, lng2) {
    const toRad = (d) => (d * Math.PI) / 180;
    const R = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  static avgRating(artisan) {
    if (!artisan?.ratings?.length) return 0;
    return (artisan.ratings.reduce((a, b) => a + b, 0) / artisan.ratings.length).toFixed(1);
  }

  static getDefaultCoords() {
    return { lat: -1.2864, lng: 36.8172 };
  }

  static async searchTools(query, radiusKm, fromArtisan) {
    const q = query.toLowerCase();
    const origin = fromArtisan 
      ? { lat: fromArtisan.lat, lng: fromArtisan.lng }
      : this.getDefaultCoords();
    
    const tools = await DataAccess.getTools();
    const artisans = await DataAccess.getArtisans();
    
    const results = [];
    for (const tool of Object.values(tools)) {
      if (!tool.available) continue;
      if (!tool.name.toLowerCase().includes(q)) continue;
      
      const owner = artisans[tool.ownerPhone];
      if (!owner) continue;
      
      const dist = this.distanceKm(origin.lat, origin.lng, owner.lat, owner.lng);
      if (dist <= radiusKm) {
        results.push({ tool, owner, dist });
      }
    }
    
    return results.sort((a, b) => a.dist - b.dist);
  }

  static async getCompletedExchanges(phone) {
    const exchanges = await DataAccess.getExchanges();
    return Object.values(exchanges).filter(
      e => (e.ownerPhone === phone || e.borrowerPhone === phone) && e.status === 'completed'
    );
  }
}

// ─── USSD Menu Builder ──────────────────────────────
class USSDMenu {
  static mainMenu() {
    return `CON JuaKali Link
1. Register
2. Search Tools
3. My Tools
4. My Exchanges
5. Rate Exchange
6. Emergency Tool
7. Support`;
  }

  static async handleRequest(phone, text) {
    const parts = text.split('*');
    const level = parts.length;
    const session = await DataAccess.getSession(phone);
    const artisan = await DataAccess.getArtisan(phone);
    
    let response = '';

    try {
      // Level 0 - Initial menu
      if (text === '') {
        await DataAccess.clearSession(phone);
        response = this.mainMenu();
      }
      // Level 1 - Main menu selection
      else if (level === 1) {
        response = await this.handleLevel1(parts[0], phone, artisan, session);
      }
      // Level 2 - Second level
      else if (level === 2) {
        response = await this.handleLevel2(parts, phone, artisan, session);
      }
      // Level 3 - Third level
      else if (level === 3) {
        response = await this.handleLevel3(parts, phone, artisan, session);
      }
      // Level 4 - Fourth level
      else if (level === 4) {
        response = await this.handleLevel4(parts, phone, artisan, session);
      }
      // Level 5 - Fifth level
      else if (level === 5) {
        response = await this.handleLevel5(parts, phone, artisan, session);
      }
      // Level 6 - Sixth level
      else if (level === 6) {
        response = await this.handleLevel6(parts, phone, artisan, session);
      }
      // Fallback
      else {
        response = 'END Session expired';
        await DataAccess.clearSession(phone);
      }
    } catch (error) {
      console.error('USSD Error:', error);
      response = 'END An error occurred. Please try again.';
      await DataAccess.clearSession(phone);
    }

    return response;
  }

  static async handleLevel1(option, phone, artisan, session) {
    switch (option) {
      case '1':
        if (artisan) {
          return `END You are already registered as ${artisan.name} (${artisan.id}).`;
        }
        return 'CON Enter your full name:';
      
      case '2':
        return 'CON Enter tool name to search (e.g. weld):';
      
      case '3':
        if (!artisan) {
          return 'END Register first. Dial again and select 1.';
        }
        const tools = await DataAccess.getToolsByOwner(phone);
        const toolList = tools.map((t, i) => 
          `${i + 1}. ${t.name} (${t.available ? 'Available' : 'Unavailable'}) - KES ${t.price}/day`
        ).join('\n');
        return `CON ${toolList || 'You have no tools listed.'}\n\n1. List a new tool\n2. Toggle availability\n3. Back`;
      
      case '4':
        if (!artisan) {
          return 'END Register first. Dial again and select 1.';
        }
        const exchanges = await DataAccess.getExchangesByUser(phone);
        if (!exchanges.length) {
          return 'END You have no exchanges yet.';
        }
        const pending = exchanges.filter(e => e.ownerPhone === phone && e.status === 'requested');
        const list = exchanges.slice(-5).map(e => `${e.id}: ${e.toolName} - ${e.status}`).join('\n');
        return `CON Recent exchanges:\n${list}\n\n${pending.length ? '1. Review pending requests\n' : ''}2. Back`;
      
      case '5':
        if (!artisan) {
          return 'END Register first. Dial again and select 1.';
        }
        return 'CON Enter Exchange ID to rate (e.g. EX-1):';
      
      case '6':
        if (!artisan) {
          return 'END Register first. Dial again and select 1.';
        }
        return 'CON Emergency Tool Request\nEnter tool name urgently needed:';
      
      case '7':
        return `CON Support:
1. Call JuaKali Link
2. WhatsApp
3. Request Callback
4. Main menu`;
      
      default:
        return 'END Invalid option. Please dial again.';
    }
  }

  static async handleLevel2(parts, phone, artisan, session) {
    const [l1, l2] = parts;

    switch (l1) {
      case '1': // Registration: name -> trade
        const trades = await DataAccess.getTrades();
        return `CON Select your trade:\n${trades.map((t, i) => `${i + 1}. ${t}`).join('\n')}`;
      
      case '2': // Search: query -> radius
        return `CON Select search radius:\n1. 1 km\n2. 2 km\n3. 5 km`;
      
      case '3': // My Tools submenu
        if (l2 === '1') {
          return 'CON Enter tool name:';
        } else if (l2 === '2') {
          const tools = await DataAccess.getToolsByOwner(phone);
          if (!tools.length) {
            return 'END You have no tools to toggle.';
          }
          return `CON Select tool to toggle:\n${tools
            .map((t, i) => `${i + 1}. ${t.name} (${t.available ? 'Available' : 'Unavailable'})`)
            .join('\n')}`;
        }
        return this.mainMenu();
      
      case '4': // My exchanges: review pending
        if (l2 === '1') {
          const exchanges = await DataAccess.getExchanges();
          const pending = Object.values(exchanges).filter(
            e => e.ownerPhone === phone && e.status === 'requested'
          );
          if (!pending.length) {
            return 'END No pending requests.';
          }
          return `CON Pending requests:\n${pending
            .map(e => `${e.id}: ${e.toolName} x${e.days}d by ${e.borrowerName}`)
            .join('\n')}\n\nReply with Exchange ID e.g. EX-1:`;
        }
        return this.mainMenu();
      
      case '5': // Rate exchange
        const ex = await DataAccess.getExchange(l2.toUpperCase());
        if (!ex || ex.status !== 'completed') {
          return 'END Exchange not found or not completed.';
        }
        await DataAccess.updateSession(phone, { rateExId: l2.toUpperCase() });
        return `CON Rate 1-5 stars:\n1\n2\n3\n4\n5`;
      
      case '6': // Emergency: tool -> description
        await DataAccess.updateSession(phone, { emTool: l2 });
        return 'CON Enter brief description of the situation:';
      
      case '7': // Support submenu
        if (l2 === '1') return 'END Call us: 0743080538';
        if (l2 === '2') return 'END WhatsApp: +254 743080538';
        if (l2 === '3') {
          // Store callback request
          await DataAccess.updateSession(phone, { callbackRequested: true });
          
          // Send SMS confirmation
          const artisan = await DataAccess.getArtisan(phone);
          const name = artisan ? artisan.name : 'User';
          const message = ` JuaKali Link: We've received your callback request, ${name}. 
Our support team will contact you within 24 hours.
Thank you for using JuaKali Link!`;
          SMSService.sendSMS(phone, message)
            .then(() => console.log(`Callback confirmation SMS sent to ${phone}`))
            .catch(err => console.error('Failed to send callback confirmation:', err));
          
          return `END Callback requested for ${phone}. You'll receive an SMS confirmation.`;
        }
        if (l2 === '4') return this.mainMenu();
        return 'END Invalid option';
      
      default:
        return 'END Session ended';
    }
  }

  static async handleLevel3(parts, phone, artisan, session) {
    const [l1, l2, l3] = parts;

    switch (l1) {
      case '1': // Registration: name, trade -> location
        const trades = await DataAccess.getTrades();
        const tradeIdx = parseInt(l3) - 1;
        if (isNaN(tradeIdx) || !trades[tradeIdx]) {
          return 'END Invalid trade selection.';
        }
        await DataAccess.updateSession(phone, {
          regName: l2,
          regTrade: trades[tradeIdx]
        });
        return 'CON Enter your location (e.g. Kariobangi near church):';
      
      case '2': // Search: query, radius -> results
        const radiusMap = { 1: 1, 2: 2, 3: 5 };
        const radius = radiusMap[l3];
        if (!radius) {
          return 'END Invalid radius.';
        }
        const artisanData = await DataAccess.getArtisan(phone);
        const results = await BusinessLogic.searchTools(l2, radius, artisanData);
        if (!results.length) {
          return `END No tools found matching "${l2}" within ${radius}km.`;
        }
        const lines = results.slice(0, 5).map((r, i) =>
          `${i + 1}. ${r.tool.name} - ${r.owner.name} (${r.owner.trade})\n   ${r.dist.toFixed(1)}km, KES ${r.tool.price}/day, ${BusinessLogic.avgRating(r.owner)} stars`
        ).join('\n');
        await DataAccess.updateSession(phone, { lastSearchResults: results });
        return `CON Results:\n${lines}\n\nEnter number to request, or 0 to exit:`;
      
      case '3': // My Tools
        if (l2 === '1') {
          await DataAccess.updateSession(phone, { newTool: { name: l3 } });
          return 'CON Enter condition:\n1. New\n2. Good\n3. Worn';
        }
        if (l2 === '2') {
          const tools = await DataAccess.getToolsByOwner(phone);
          const idx = parseInt(l3) - 1;
          const tool = tools[idx];
          if (!tool) {
            return 'END Invalid tool selection.';
          }
          await DataAccess.updateTool(tool.id, { available: !tool.available });
          return `END ${tool.name} is now ${!tool.available ? 'available' : 'unavailable'}.`;
        }
        return this.mainMenu();
      
      case '4': // My exchanges: accept/decline
        if (l2 === '1') {
          const ex = await DataAccess.getExchange(l3.toUpperCase());
          if (!ex || ex.ownerPhone !== phone || ex.status !== 'requested') {
            return 'END Request not found or already handled.';
          }
          await DataAccess.updateSession(phone, { respondExId: l3.toUpperCase() });
          return `CON ${ex.toolName} requested by ${ex.borrowerName} for ${ex.days} day(s).\n1. Accept\n2. Decline`;
        }
        return this.mainMenu();
      
      case '5': // Rate exchange: stars
        const exchange = await DataAccess.getExchange(l2.toUpperCase());
        const stars = parseInt(l3);
        if (!exchange || !stars || stars < 1 || stars > 5) {
          return 'END Invalid rating.';
        }
        const ratee = phone === exchange.ownerPhone ? exchange.borrowerPhone : exchange.ownerPhone;
        await DataAccess.addRating(ratee, stars);
        return `END Thank you. You rated this exchange ${stars} star(s).`;
      
      case '6': // Emergency: description -> radius
        await DataAccess.updateSession(phone, { emDescription: l2 });
        return 'CON Select broadcast radius:\n1. 1 km\n2. 2 km\n3. 5 km';
      
      default:
        return 'END Invalid flow';
    }
  }

  static async handleLevel4(parts, phone, artisan, session) {
    const [l1, l2, l3, l4] = parts;

    switch (l1) {
      case '1': // Registration: save
        const coords = BusinessLogic.getDefaultCoords();
        await DataAccess.createArtisan(phone, {
          name: session.regName,
          trade: session.regTrade,
          location: l4,
          lat: coords.lat + (Math.random() - 0.5) * 0.05,
          lng: coords.lng + (Math.random() - 0.5) * 0.05,
          experience: 0,
          certifications: "",
          approved: false,
          ratings: []
        });
        const newArtisan = await DataAccess.getArtisan(phone);
        await DataAccess.clearSession(phone);
        return `END Registration submitted, ${session.regName}!\nID: ${newArtisan.id}`;
      
      case '2': // Search: select result -> days
        const idx = parseInt(l4) - 1;
        const results = session.lastSearchResults;
        if (l4 === '0' || !results || !results[idx]) {
          await DataAccess.clearSession(phone);
          return 'END Search cancelled.';
        }
        await DataAccess.updateSession(phone, { requestTool: results[idx].tool });
        return 'CON Enter number of days needed:';
      
      case '3': // List new tool: condition -> price
        if (l2 === '1') {
          const conditionMap = { 1: 'new', 2: 'good', 3: 'worn' };
          const condition = conditionMap[l4];
          if (!condition) {
            return 'END Invalid condition.';
          }
          session.newTool.condition = condition;
          await DataAccess.updateSession(phone, session);
          return 'CON Enter daily rental price (KES):';
        }
        return 'END Invalid option.';
      
      case '4': // Accept/decline request
        if (l2 === '1') {
          const ex = await DataAccess.getExchange(session.respondExId);
          if (!ex) {
            return 'END Request no longer available.';
          }
          if (l4 === '1') {
            await DataAccess.updateExchange(ex.id, { status: 'accepted' });
            await DataAccess.updateTool(ex.toolId, { available: false });
            return `END You accepted the request for ${ex.toolName}.`;
          } else if (l4 === '2') {
            await DataAccess.updateExchange(ex.id, { status: 'declined' });
            return `END You declined the request for ${ex.toolName}.`;
          }
        }
        return 'END Invalid option.';
      
      case '6': // Emergency: broadcast
        const radiusMap2 = { 1: 1, 2: 2, 3: 5 };
        const radius2 = radiusMap2[l4] || 1;
        const artisan2 = await DataAccess.getArtisan(phone);
        const allArtisans = await DataAccess.getArtisans();
        
        await DataAccess.createEmergency({
          requester: artisan2,
          tool: session.emTool,
          description: session.emDescription,
          radius: radius2
        });

        const notified = Object.values(allArtisans).filter(a =>
          a.phone !== phone &&
          BusinessLogic.distanceKm(artisan2.lat, artisan2.lng, a.lat, a.lng) <= radius2
        );

        await DataAccess.clearSession(phone);
        
        // Send confirmation to requester
        const confirmMessage = `🚨 JuaKali Emergency: Your request for "${session.emTool}" has been broadcast to ${notified.length} nearby artisans. 
You will be contacted if someone can help.`;
        SMSService.sendSMS(phone, confirmMessage)
          .then(() => console.log(`Emergency confirmation SMS sent to ${phone}`))
          .catch(err => console.error('Failed to send emergency confirmation:', err));
        
        return `END Emergency broadcast sent for "${session.emTool}" to ${notified.length} nearby artisan(s) within ${radius2}km. Expires in 2 hours.`;
      
      default:
        return 'END Invalid flow';
    }
  }

  static async handleLevel5(parts, phone, artisan, session) {
    const [l1, l2, l3, l4, l5] = parts;

    switch (l1) {
      case '2': // Search: days -> create exchange
        const days = parseInt(l5);
        const tool = session.requestTool;
        if (!tool) {
          await DataAccess.clearSession(phone);
          return 'END Session expired. Please search again.';
        }
        if (!days || days < 1) {
          return 'END Days must be a positive number.';
        }
        const borrowerName = artisan ? artisan.name : phone;
        await DataAccess.createExchange({
          toolId: tool.id,
          toolName: tool.name,
          ownerPhone: tool.ownerPhone,
          borrowerPhone: phone,
          borrowerName,
          days
        });
        await DataAccess.clearSession(phone);
        return `END Request sent! ${tool.name} for ${days} day(s).\nAwaiting owner approval.`;
      
      case '3': // List new tool: price -> deposit
        if (l2 === '1') {
          const price = parseInt(l5);
          if (!price || price < 0) {
            return 'END Invalid price.';
          }
          session.newTool.price = price;
          await DataAccess.updateSession(phone, session);
          return 'CON Enter refundable deposit (KES), or 0 for none:';
        }
        return 'END Invalid flow.';
      
      default:
        return 'END Invalid flow.';
    }
  }

  static async handleLevel6(parts, phone, artisan, session) {
    const [l1, l2, l3, l4, l5, l6] = parts;

    if (l1 === '3' && l2 === '1') {
      const deposit = parseInt(l6) || 0;
      await DataAccess.createTool({
        ownerPhone: phone,
        name: session.newTool.name,
        description: '',
        condition: session.newTool.condition,
        price: session.newTool.price,
        deposit: deposit
      });
      await DataAccess.clearSession(phone);
      return `END Tool "${session.newTool.name}" listed successfully at KES ${session.newTool.price}/day.`;
    }
    
    return 'END Invalid flow.';
  }
}

// ─── Express App ───────────────────────────────────
const app = express();
app.use(cors());
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// ─── USSD Handler ──────────────────────────────────
app.post("/ussd", async (req, res) => {
  try {
    let { phoneNumber, text } = req.body;
    text = text || '';
    const phone = (phoneNumber || 'unknown').replace('+', '');
    
    // Rate limiting
    const session = await DataAccess.getSession(phone);
    const now = Date.now();
    if (session.lastRequest && (now - session.lastRequest) < 100) { // 100ms minimum between requests
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    await DataAccess.updateSession(phone, { lastRequest: now });
    
    const response = await USSDMenu.handleRequest(phone, text);
    
    res.setHeader('Content-Type', 'text/plain');
    res.send(response);
  } catch (error) {
    console.error('USSD Handler Error:', error);
    res.setHeader('Content-Type', 'text/plain');
    res.send('END System error. Please try again.');
  }
});

// ─── Admin Routes ────────────────────────────────────
app.get("/admin/stats", async (req, res) => {
  try {
    const artisans = await DataAccess.getArtisans();
    const tools = await DataAccess.getTools();
    const exchanges = await DataAccess.getExchanges();
    const emergencies = await DataAccess.getEmergencies();
    const config = await DataAccess.getConfig();
    
    res.json({
      artisans: Object.keys(artisans).length,
      tools: Object.keys(tools).length,
      exchanges: Object.keys(exchanges).length,
      emergencies: emergencies.length,
      activeSessions: Object.keys(store.getData('sessions')).length,
      config
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/admin/backup", async (req, res) => {
  try {
    const timestamp = await store.backup();
    res.json({ success: true, timestamp });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── SMS Admin Routes ────────────────────────────────────
app.get("/admin/sms/logs", async (req, res) => {
  try {
    const logs = store.getData('sms_logs');
    res.json({
      total: logs.length,
      recent: logs.slice(-50).reverse()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/admin/sms/test", async (req, res) => {
  try {
    const { phone, message } = req.body;
    if (!phone || !message) {
      return res.status(400).json({ error: 'Phone and message required' });
    }
    
    const result = await SMSService.sendSMS(phone, message);
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── Health Check ────────────────────────────────────
app.get("/", (req, res) => {
  res.send('JuaKali Link USSD Running with SMS Integration 🚀');
});

// ─── Start Server ────────────────────────────────────
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`JuaKali Link USSD running on port ${PORT}`);
  console.log(`Data directory: ${path.join(__dirname, 'data')}`);
  console.log(`Backup directory: ${path.join(__dirname, 'backups')}`);
  console.log(`SMS Service: ${process.env.AT_USERNAME ? 'Configured' : 'Using Sandbox'}`);
});