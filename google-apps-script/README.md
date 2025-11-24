# 📋 Google Apps Script - Form Response Capture

Automatically capture form responses and store them in Google Sheets using Google Apps Script.

## 📁 Files Included

- **`Code.gs`** - Main Google Apps Script code
- **`DEPLOYMENT_GUIDE.md`** - Step-by-step deployment instructions
- **`test-form.html`** - HTML test form to verify your deployment

## 🚀 Quick Start

1. Read the **`DEPLOYMENT_GUIDE.md`** for detailed instructions
2. Deploy the `Code.gs` script as a web app
3. Use `test-form.html` to test your deployment
4. Integrate the URL into your website or application

## ✨ Features

- ✅ Auto-creates Google Sheet with proper headers
- ✅ Captures timestamp, name, email, subject, message, and custom fields
- ✅ Accepts JSON and form-data payloads
- ✅ Returns JSON response with status
- ✅ No external dependencies required
- ✅ CORS-friendly for web integration

## 📊 Example Usage

### HTML Form
```html
<form action="YOUR_WEB_APP_URL" method="POST">
  <input name="name" required>
  <input name="email" type="email" required>
  <input name="subject" required>
  <textarea name="message" required></textarea>
  <button type="submit">Submit</button>
</form>
```

### JavaScript
```javascript
fetch('YOUR_WEB_APP_URL', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: 'John Doe',
    email: 'john@example.com',
    subject: 'Inquiry',
    message: 'Hello!'
  })
});
```

### cURL
```bash
curl -X POST "YOUR_WEB_APP_URL" \
  -H "Content-Type: application/json" \
  -d '{"name":"John","email":"john@example.com","subject":"Test","message":"Test message"}'
```

## 🔒 Security

- Configure access permissions in deployment settings
- Use "Anyone with Google account" for better security
- Add custom validation in the script if needed

## 📚 Documentation

See **`DEPLOYMENT_GUIDE.md`** for complete documentation including:
- Step-by-step deployment
- Customization options
- Integration examples
- Troubleshooting guide

## 🌐 Integration with SustainTheWorld Website

This script can be integrated with the main website's contact form to automatically capture and store all form submissions in a centralized Google Sheet.

## 📞 Support

For issues or questions:
1. Check the deployment guide
2. Review Apps Script execution logs
3. Test with the provided test form
4. Verify your web app URL

---

**Version**: 1.0.0
**License**: Open Source
**Project**: SustainTheWorld
