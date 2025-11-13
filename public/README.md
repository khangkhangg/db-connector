# DB Connector Web UI

Modern web interface for database connection management.

## Features

- 🔍 **Auto-Discovery**: Automatically discover local SQL Server instances (Windows)
- 🔐 **Windows Authentication**: Connect without passwords using Windows Auth
- 💾 **Save Connections**: Save connection profiles for quick access
- 🧪 **Test Connections**: Verify settings before connecting
- 🌐 **Multi-Database**: Support for MSSQL, MySQL, and PostgreSQL
- 📊 **Database Browser**: View available databases and details

## Quick Start

1. Start the application:
   ```bash
   npm run client
   ```

2. Open your browser:
   ```
   http://localhost:3000
   ```

3. Click "Discover Local SQL Server Instances"

4. Select an instance and connect!

## UI Components

### Auto-Discovery Panel (Left)
- **Discover Button**: Scans for local SQL Server instances
- **Instance List**: Shows all discovered instances
- **Instance Details**: Version, databases, size information
- **Connect Button**: Connect using Windows Authentication

### Manual Connection Panel (Right)
- **Database Type**: Select MSSQL, MySQL, or PostgreSQL
- **Connection Form**: Server, port, database, credentials
- **Windows Auth Checkbox**: Use Windows Authentication (MSSQL only)
- **Test Connection**: Verify settings
- **Save Connection**: Store profile for reuse
- **Connect**: Establish connection

### Saved Connections Panel (Bottom)
- **Connection List**: All saved connection profiles
- **Load Button**: Load connection settings
- **Delete Button**: Remove saved connection

### Active Connection Info
- **Connection Details**: Current connection information
- **Disconnect Button**: Close active connection

## Keyboard Shortcuts

- **Enter**: Submit connection form
- **Escape**: Close alerts

## Browser Compatibility

- ✅ Chrome 90+
- ✅ Firefox 88+
- ✅ Edge 90+
- ✅ Safari 14+

## Local Storage

The UI stores connection profiles in browser localStorage:
- Saved connections
- Last used settings
- UI preferences

**Note**: Passwords are stored in browser localStorage only. For production use, configure authentication and use secure storage.

## API Endpoints Used

- `POST /api/connections/discover` - Discover SQL Server instances
- `POST /api/connections/databases` - Get databases for instance
- `POST /api/connections/test` - Test connection
- `POST /api/connections/connect` - Establish connection
- `POST /api/connections/disconnect` - Close connection
- `GET /api/connections/current-user` - Get Windows user info

## Screenshots

### Auto-Discovery
![Auto-Discovery](../docs/images/ui-discovery.png)

### Manual Connection
![Manual Connection](../docs/images/ui-manual.png)

### Saved Connections
![Saved Connections](../docs/images/ui-saved.png)

## Customization

The UI is a single HTML file (`index.html`) with embedded CSS and JavaScript. You can easily customize:

- **Colors**: Modify the CSS gradient and color scheme
- **Layout**: Change grid layout in `.main-content`
- **Features**: Add/remove form fields
- **Branding**: Update header and title

## Security Notes

### Local Use
- Authentication disabled by default for local client use
- Passwords stored in browser localStorage only
- Windows Authentication recommended (no password storage)

### Network Use
If exposing UI on network:
1. Enable authentication: `API_ENABLE_AUTH=true`
2. Use HTTPS (reverse proxy recommended)
3. Configure CORS origins
4. Implement proper session management

## Troubleshooting

### UI Not Loading
- Check server is running: `http://localhost:3000/health`
- Clear browser cache
- Check browser console for errors

### Auto-Discovery Not Working
- Ensure SQL Server is running
- Check SQL Server Browser service
- Verify Windows permissions
- See [Auto-Discovery Guide](../docs/AUTO_DISCOVERY.md)

### Connection Fails
- Test with SQL Server Management Studio first
- Verify credentials
- Check firewall settings
- Review SQL Server error logs

## Development

To modify the UI:

1. Edit `public/index.html`
2. Restart server: `npm run client`
3. Refresh browser (Ctrl+F5 to clear cache)

The UI automatically reloads on server restart.

## Related Documentation

- [Windows Client Guide](../docs/WINDOWS_CLIENT.md)
- [Auto-Discovery Guide](../docs/AUTO_DISCOVERY.md)
- [API Documentation](../docs/API.md)
- [Connection Management](../docs/CONNECTIONS.md)

## License

MIT
