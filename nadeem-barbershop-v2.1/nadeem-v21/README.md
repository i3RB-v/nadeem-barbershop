# Nadeem BarberShop — V1.9 + Barber Accounts

## Run
1. Open this folder in Command Prompt.
2. Run `npm install`.
3. Run `npm start`.
4. Open http://localhost:3000

## Accounts
### Manager
- Username: admin
- Password: admin123

### Barbers
Each barber now has a separate account and can see only his own bookings.

| Barber | Username | Password |
|---|---|---|
| Nadeem | nadeem | nadeem123 |
| Khalid | khalid | khalid123 |
| Abood | abood | abood123 |
| Malek | malek | malek123 |

Barbers can log in from `/login.html` and are redirected automatically to `/barber.html`.

> Change these development passwords before production use.

## V2.1 WhatsApp + AI setup

### WhatsApp reminders
The server checks appointments every 30 seconds and targets a reminder about 2 hours before the appointment, with a 5-minute catch-up window. WhatsApp business-initiated reminders must use an approved WhatsApp template outside the 24-hour customer service window. Set these variables in a `.env` file:

- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_WHATSAPP_FROM`
- `TWILIO_WHATSAPP_CONTENT_SID`
- `SHOP_TZ_OFFSET=+03:00`

The code sends template variables as: `1=customer name`, `2=date`, `3=time`, `4=barber name`.

For testing, Twilio's WhatsApp Sandbox can be used first. Production reminders require an approved template and WhatsApp Business setup.

### AI chatbot
Set `GEMINI_API_KEY` in `.env` to enable Gemini-powered answers. If no API key is configured, the chatbot falls back to a small local FAQ for services, prices, branches, barbers, and hours.
