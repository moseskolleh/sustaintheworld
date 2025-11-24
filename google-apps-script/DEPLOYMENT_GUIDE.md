# Google Apps Script - Form Response Capture
## Deployment Guide

This Google Apps Script automatically captures form responses and stores them in a Google Sheet.

---

## 🚀 Quick Start Deployment

### Step 1: Create a New Google Sheet

1. Go to [Google Sheets](https://sheets.google.com)
2. Create a new blank spreadsheet
3. Give it a name (e.g., "Form Responses Database")

### Step 2: Open Apps Script Editor

1. In your Google Sheet, click **Extensions** → **Apps Script**
2. Delete any default code in the editor
3. Copy the entire contents of `Code.gs` and paste it into the editor
4. Click the **Save** icon (💾) or press `Ctrl+S`
5. Give your project a name (e.g., "Form Response Capture")

### Step 3: Deploy as Web App

1. Click **Deploy** → **New deployment**
2. Click the gear icon ⚙️ next to "Select type"
3. Choose **Web app**
4. Configure the deployment:
   - **Description**: Form Response Capture API (optional)
   - **Execute as**: Me (your email)
   - **Who has access**: Anyone (or "Anyone with Google account" if you prefer)
5. Click **Deploy**
6. If prompted, click **Authorize access**
7. Select your Google account
8. Click **Advanced** → **Go to [Your Project Name] (unsafe)**
9. Click **Allow**
10. **Copy the Web App URL** - this is your endpoint!

The URL will look like:
```
https://script.google.com/macros/s/XXXXXXXXXXXXXXXXXXXXX/exec
```

### Step 4: Test Your Deployment

You can test it using curl:

```bash
curl -X POST "YOUR_WEB_APP_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Doe",
    "email": "john@example.com",
    "message": "Test submission"
  }'
```

Or use the provided `test-form.html` file.

---

## 📊 Features

✅ **Automatic Timestamp**: Each response includes submission timestamp
✅ **Flexible Data Capture**: Accepts JSON or form-data
✅ **Auto-creates Sheet**: Creates "Form Responses" sheet if it doesn't exist
✅ **JSON Response**: Returns success/error status
✅ **Additional Fields**: Captures any extra fields in "Additional Data" column

---

## 📝 Data Structure

The script creates a sheet with these columns:

| Timestamp | Name | Email | Message | Additional Data |
|-----------|------|-------|---------|-----------------|
| Auto-generated | From 'name' field | From 'email' field | From 'message' field | Any other fields as JSON |

---

## 🔧 Customization

### Change Sheet Name

Edit line 7 in `Code.gs`:
```javascript
var SHEET_NAME = "Your Custom Name";
```

### Add More Columns

Modify the `setupSheet()` function to add custom columns:
```javascript
sheet.appendRow([TIMESTAMP_COLUMN, "Name", "Email", "Message", "Phone", "Company", "Additional Data"]);
```

Then update the `doPost()` function to capture these fields.

---

## 🌐 Integration Examples

### HTML Form

```html
<form id="contactForm">
  <input type="text" name="name" placeholder="Name" required>
  <input type="email" name="email" placeholder="Email" required>
  <textarea name="message" placeholder="Message" required></textarea>
  <button type="submit">Submit</button>
</form>

<script>
document.getElementById('contactForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const formData = new FormData(e.target);
  const data = Object.fromEntries(formData);

  const response = await fetch('YOUR_WEB_APP_URL', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });

  const result = await response.json();
  alert(result.message);
});
</script>
```

### JavaScript Fetch

```javascript
fetch('YOUR_WEB_APP_URL', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: 'Jane Smith',
    email: 'jane@example.com',
    message: 'Hello from JavaScript!'
  })
})
.then(response => response.json())
.then(data => console.log(data));
```

### Python

```python
import requests

url = 'YOUR_WEB_APP_URL'
data = {
    'name': 'Python User',
    'email': 'python@example.com',
    'message': 'Hello from Python!'
}

response = requests.post(url, json=data)
print(response.json())
```

---

## 🔒 Security Considerations

1. **Access Control**: Set "Who has access" to "Anyone with Google account" for better security
2. **Data Validation**: The script accepts any data - add validation if needed
3. **Rate Limiting**: Google Apps Script has quotas - see [quota limits](https://developers.google.com/apps-script/guides/services/quotas)
4. **CORS**: The web app handles CORS automatically

---

## 🐛 Troubleshooting

### "Authorization required" error
- Redeploy the web app and complete the authorization process

### "Permission denied" error
- Ensure "Execute as" is set to your account
- Check "Who has access" settings

### Data not appearing in sheet
- Check the "Form Responses" sheet exists
- Run the `testCapture()` function in Apps Script editor to debug
- View logs: Run → View logs

### Getting the Web App URL again
- In Apps Script editor: Deploy → Manage deployments
- Or run the `getWebAppUrl()` function

---

## 📚 Additional Resources

- [Google Apps Script Documentation](https://developers.google.com/apps-script)
- [Web Apps Guide](https://developers.google.com/apps-script/guides/web)
- [SpreadsheetApp Reference](https://developers.google.com/apps-script/reference/spreadsheet)

---

## 📞 Support

If you encounter issues:
1. Check the execution logs in Apps Script editor
2. Verify the web app URL is correct
3. Test with the provided test function
4. Check Google Apps Script quotas

---

**Created by**: SustainTheWorld Project
**License**: Open Source
**Version**: 1.0.0
