# Live Meet Display

A powerlifting meet display system that fetches data in real time and presents it through a customisable web interface.

## Features

- **Real-time Updates**: Automatically fetches and displays meet data every 60 seconds
- **Multi-Federation Support**: Configurable for IPF, USAPL, IPL, WRPF, GPC, and more
- **Layout Modes**:
  - Table view for comprehensive data display
  - Compact card view for streamlined presentation
- **Advanced Filtering**: Search for specific lifters
- **Live Attempt Tracking**: Colour-coded good/bad lifts with real-time updates
- **Automatic Rankings**: Calculates placements based on total and bodyweight
- **Responsive Design**: Works on desktop, tablet, and mobile devices
- **Fullscreen Mode**: Perfect for projection and live streaming

## Installation

### Setup

1. Clone or download this repository

2. Install dependencies:

```bash
npm install
```

3. Configure federations (optional):
   Edit `federations.json` to add or modify federation configurations. Default configuration is provided for IPF.

## Usage

### Starting the Server

```bash
npm start
```

The server will start on port 9001. Open your browser to:

```
http://localhost:9001
```

### Configuration

1. **Meet ID**: Enter the meet ID (e.g., `m1a2j7aepd02`)

   - Find this in the URL for your meet
   - Format: `m` followed by alphanumeric characters

2. **Federation**: Select the appropriate federation from the dropdown

   - Ensures correct weight classes and divisions are used
   - Default: International Powerlifting Federation (IPF)

3. Click **Connect** to start receiving live data

### Using the Display

#### Controls

- **Toggle Layout**: Switch between table and card views
- **Fullscreen**: Enter fullscreen mode for presentations
- **Disconnect**: Return to configuration screen
- **Gender Filters**: Show/hide male or female lifters
- **Search**: Filter lifters by name

#### Table View

- Comprehensive spreadsheet-style display
- Colour-coded attempts:
  - Green: Successful lift
  - Red: Failed lift
  - White: Pending attempt
- Bold text for best lifts
- Gold/Silver/Bronze highlighting for top 3 places

#### Compact View

- Card-based layout
- Easier to read from distance
- Shows all attempts and current totals
- Ideal for projection or streaming overlays

## Federation Configuration

### Adding New Federations

Edit `federations.json`:

```json
{
  "YOUR_FED": {
    "name": "Your Federation Name",
    "equipmentLevels": ["RAW", "EQUIPPED"],
    "drugTested": true,
    "weightClasses": {
      "FEMALE": {
        "w-0": "47",
        "w-1": "52",
        ...
      },
      "MALE": {
        "w-0": "59",
        "w-1": "66",
        ...
      }
    },
    "divisions": {
      "O": "Open",
      "J": "Junior",
      ...
    }
  }
}
```

## Architecture

### Backend (server.js)

- Built with uWS.js for high-performance WebSocket connections
- Fetches data
- Processes lifter and attempt documents
- Calculates best lifts, totals, and placements
- Broadcasts updates to all connected clients

### Frontend (public/)

- **index.html**: Main application structure
- **styles.css**: Complete styling with responsive design
- **app.js**: WebSocket client and rendering logic

### Data Flow

1. Server fetches all documents
2. Documents are separated into lifters and attempts
3. Attempts are matched to lifters by ID
4. Best lifts and totals are calculated
5. Placements are assigned based on total (higher is better) and bodyweight (lower wins ties)
6. Data is broadcast to all connected web clients via WebSocket
7. Clients render the data based on current filters and layout

## API Endpoints

### WebSocket (`ws://localhost:9001/ws`)

#### Client → Server Messages

```json
{
  "type": "configure",
  "meetId": "m1a2j7aepd02",
  "federation": "APA"
}
```

#### Server → Client Messages

Initial connection:

```json
{
  "type": "initial",
  "data": {
    "lifters": [...],
    "lastUpdate": "2025-10-05T12:00:00.000Z",
    "federation": "APA",
    "federations": ["APA", "IPF", "USAPL", ...]
  }
}
```

Updates:

```json
{
  "type": "update",
  "data": {
    "lifters": [...],
    "lastUpdate": "2025-10-05T12:01:00.000Z",
    "federation": "APA"
  }
}
```

## Development

### Running in Development Mode

```bash
npm run dev
```

This uses nodemon to automatically restart the server when files change.

### Modifying Update Interval

In `server.js`, change the `UPDATE_INTERVAL` constant:

```javascript
const UPDATE_INTERVAL = 60000; // milliseconds (60 seconds default)
```

### Customising Appearance

Edit `public/styles.css` to modify:

- Colour scheme (CSS variables at the top)
- Layout and spacing
- Typography
- Responsive breakpoints

## Troubleshooting

### Connection Issues

- Verify the meet ID is correct
- Check that the meet is live
- Ensure firewall allows connections to the database
- Check browser console for WebSocket errors

### No Data Appearing

- Confirm meet has started and lifters have data
- Check server console for fetch errors
- Verify federation configuration matches meet setup

### Performance Issues

- Reduce update interval if too frequent
- Use compact view for better performance with many lifters
- Close unused browser tabs
- Check network connection quality

### Incorrect Weight Classes

- Verify the federation configuration in `federations.json`
- Check that weight class IDs match LiftingCast's internal IDs
- Contact federation technical director for official weight class mappings

### Document Types

**Lifter Documents** contain:

- `_id`: Unique lifter identifier
- `name`: Lifter's full name
- `birthDate`: Date of birth
- `gender`: "MALE" or "FEMALE"
- `bodyweight`: Weigh-in bodyweight
- `divisions`: Array of division assignments
- `squatRackHeight`, `benchRackHeight`: Equipment settings

**Attempt Documents** contain:

- `lifterId`: Reference to lifter document
- `liftName`: "squat", "bench", or "deadlift"
- `attemptNumber`: "1", "2", or "3"
- `weight`: Attempt weight in kg
- `result`: "good", "bad", or null (pending)

## Deployment

### Production Deployment

1. **Update PORT constant** in `server.js` if needed (default: 9001)

2. **Set up reverse proxy** (nginx example):

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:9001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
```

3. **Use process manager** (PM2 example):

```bash
npm install -g pm2
pm2 start server.js --name meet-display
pm2 save
pm2 startup
```

4. **Security considerations**:
   - Enable HTTPS for production
   - Set up CORS if needed
   - Implement rate limiting if publicly accessible
   - Consider authentication for configuration panel

### Docker Deployment (Optional)

Create `Dockerfile`:

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 9001
CMD ["node", "server.js"]
```

Build and run:

```bash
docker build -t meet-display .
docker run -p 9001:9001 meet-display
```

## Project Structure

```
liftingcast-live-display/
├── server.js              # Backend server (uWS.js)
├── federations.json       # Federation configurations
├── package.json           # Dependencies
├── README.md             # This file
└── public/               # Frontend files
    ├── index.html        # Main HTML structure
    ├── styles.css        # Complete styling
    └── app.js            # Frontend JavaScript
```

### Federation Configurations Needed

We need help completing federation configurations for:

- IPL (International Powerlifting League)
- CAPO (????)
- WRPF (World Raw Powerlifting Federation)
- GPC (Global Powerlifting Committee)
- WPC (World Powerlifting Congress)
- Other major federations

If you have official weight class and division information for these federations, please contribute!

## Known Limitations

- **Weight Class Detection**: Relies on weight class ID mapping
- **Records**: Record tracking not yet implemented (planned feature)
- **Multiple Platforms**: Currently displays all lifters together (no platform separation)
- **Equipment/Division Filtering**: Not yet implemented
- **Historical Data**: Only shows current meet state, no historical tracking

## Future Enhancements

- [ ] Federation record comparison and percentage calculations
- [ ] Wilks/IPF GL/Dots score calculations
- [ ] Platform-specific views for multi-platform meets
- [ ] Equipment level filtering (Raw vs Equipped)
- [ ] Division-specific leaderboards
- [ ] Current lifter on platform highlighting
- [ ] Attempt progression predictions
- [ ] Export results to CSV/JSON
- [ ] Custom branding/theming per federation
- [ ] Mobile app versions
- [ ] Integration with streaming software (OBS)

## License

```

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
```
