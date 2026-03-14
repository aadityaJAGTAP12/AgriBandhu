# Agri Bandhu Backend

Agri Bandhu is an AI-powered farming assistant providing weather alerts, crop advice, disease detection, and government scheme information through WhatsApp.

## Project Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Environment Variables:**
   A `.env` file has been generated with placeholder keys. Ensure these are populated before deploying:
   - `PORT=3000`
   - `OPENWEATHER_API_KEY`
   - `WHATSAPP_TOKEN`
   - `VERIFY_TOKEN` (for WhatsApp webhook verification)

3. **Running the local server:**
   ```bash
   npm start
   ```

## Local Development

The server runs on port 3000 by default. It includes several endpoints for local testing:

- **POST `/webhook`**: Send simulated WhatsApp messages here.
  Example payload:
  ```json
  { "text": "What is the weather like?" }
  ```
- **GET `/api/weather`**: Test the mock weather service.
- **GET `/api/advisory`**: Test the generated crop advisory.
