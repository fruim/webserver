const express = require('express');
const expressSession = require('express-session');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const mysql = require('mysql2/promise');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const bodyParser = require('body-parser');
const { google } = require('googleapis');
const jwt = require('jsonwebtoken');
const { emit } = require('process');

const app = express();

const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"],
        allowedHeaders: ["my-custom-header"],
        credentials: true
    },
    pingInterval: 10000, // send a ping every 10 seconds
    pingTimeout: 5000,
});

app.use(cors());

const dbConfig = {
    host: 'srv1157.hstgr.io',
    user: 'u629484482_healthi_web',
    password: 'Musician_1999!!',
    database: 'u629484482_healthi',
    waitForConnections: true,
    connectionLimit: 0, // Adjust based on your application needs
    queueLimit: 0,
    connectTimeout: 10000, // 10 sec
};

const db = mysql.createPool(dbConfig);

io.on('connection', (socket) => {
    console.log('A user connected');
    //User Verification
    socket.on('verification', async (data) => {
        const { username, password } = data;
    
        // For hashing password with Salt
        function hashPassword(password, salt) {
            const hmac = crypto.createHmac('sha256', salt);
            const hashedPassword = hmac.update(password).digest('hex');
            return hashedPassword;
        }
    
        try {
            const results = await db.execute('SELECT * FROM `user` WHERE `username` = ? AND `type` = "user"', [username]);
    
            if (results.length > 0) {
                const uid = results[0]['id'];
                const adminid = results[0]['admin_id'];
                const facility = results[0]['facility'];
                const storedPasswordHash = results[0]['password_hash'];
                const storedSalt = results[0]['salt'];
    
                const hashedEnteredPassword = hashPassword(password, storedSalt);
    
                if (hashedEnteredPassword === storedPasswordHash) {
                    // Password is correct
                    console.log('Authentication successful');
                    socket.emit('verificationResult', { success: true, message: 'Authentication successful', uid, adminid, facility });
                } else {
                    // Password is incorrect
                    console.log('Authentication failed');
                    socket.emit('verificationResult', { success: false, message: 'Authentication failed' });
                }
            } else {
                console.log('User not found');
                socket.emit('verificationResult', { success: false, message: 'User not found' });
            }
        } catch (error) {
            console.error('MySQL query error:', error);
    
            if (error.code === 'PROTOCOL_CONNECTION_LOST') {
                // Reconnect on connection lost
                try {
                    console.log('Database reconnected');
                    // Retry the verification after successful reconnection
                    socket.emit('verification', data);
                } catch (reconnectError) {
                    console.error('Failed to reconnect to the database:', reconnectError);
                    socket.emit('verificationResult', { success: false, message: 'Failed to reconnect to the database' });
                }
            } else {
                socket.emit('verificationResult', { success: false, message: 'An unexpected error occurred' });
            }
        }
    });
    


    //Start Here
    socket.on('retrievedatapoints', async (uid) => {
        try {
            const query = 'SELECT r.* FROM records r JOIN user u ON r.uid = u.id WHERE u.admin_id = ?';
            const [results] = await db.execute(query, [uid]);
    
            socket.emit('getdatapoints', results);
        } catch (error) {
            console.error('MySQL query error:', error);
            socket.emit('getdatapoints', { error: 'Failed to retrieve data points' });
        }
    });    

    socket.on('requestCVDCoordinates', async (data) => {
        try {
            const { uid } = data;
    
            const query = 'SELECT ac.id AS coordinate_id, ac.uid AS admin_id, ac.address, ac.longitude, ac.latitude, r.risk, YEAR(r.dateassess) AS assessment_year, COUNT(*) AS total_count, (SELECT COUNT(*) FROM records r2 WHERE r2.uid = u.id) AS total_record_count FROM records r JOIN user u ON r.uid = u.id JOIN address_coordinates ac ON u.admin_id = ac.uid AND r.address = ac.address WHERE u.admin_id = ? GROUP BY ac.id, ac.uid, ac.address, ac.longitude, ac.latitude, assessment_year, r.risk';
    
            const [results] = await db.execute(query, [uid]);
    
            console.log('Requested CVD Data sent!');
            socket.emit('getCVDCoordinates', results);
        } catch (error) {
            console.error('MySQL query error:', error);
            socket.emit('getCVDCoordinates', { error: 'Failed to retrieve CVD coordinates' });
        }
    });    
    

    socket.on('requestWaypoints', async (data) => {
        try {
            const { uid } = data;
    
            const query = 'SELECT * FROM `address_coordinates` WHERE `uid` = ?';
            const [results] = await db.execute(query, [uid]);
    
            console.log('Requested Waypoint Data sent!');
            socket.emit('getWaypoints', results);
        } catch (error) {
            console.error('MySQL query error:', error);
            socket.emit('getWaypoints', { error: 'Failed to retrieve waypoints' });
        }
    });
    

    socket.on('retrievecoordinates', async (uid) => {
        try {
            const query = 'SELECT * FROM `address_coordinates` WHERE uid = ?';
            const [results] = await db.execute(query, [uid]);
    
            console.log('Coordinates retrieved successfully');
            socket.emit('getcoordinates', results);
        } catch (error) {
            console.error('MySQL query error:', error);
            socket.emit('getcoordinates', { error: 'Failed to retrieve coordinates' });
        }
    });

    socket.on('insertCoordinates', async (insertData) => {
    const { uid, address, longitude, latitude } = insertData;
  
        try {
            // Get a connection from the pool
            db.getConnection(async (err, connection) => {
                if (err) {
                    console.error('Error getting connection from pool:', err);
                    return;
                }
    
                try {
                    // Execute the query using the acquired connection
                    const query = 'INSERT INTO `address_coordinates`(`uid`, `address`, `longitude`, `latitude`) VALUES (?, ?, ?, ?)';
                    const [results] = await connection.execute(query, [uid, address, longitude, latitude]);
                    
                    console.log('Data Coordinates Inserted');
                } catch (error) {
                    console.error('MySQL query error:', error);
                } finally {
                    // Release the connection back to the pool after use
                    connection.release();
                }
            });
        } catch (error) {
            console.error('Error:', error);
        }
    });



    
    //Check Email Address
    socket.on('retrieveUsers', async (uid) => {
        try {
            const query = 'SELECT * FROM `user` WHERE admin_id = ?';
            const [results] = await db.execute(query, [uid]);
    
            console.log('Users retrieved successfully');
            socket.emit('getUsers', results);
        } catch (error) {
            console.error('MySQL query error:', error);
            socket.emit('getUsers', { error: 'Failed to retrieve users' });
        }
    });
    
    socket.on('deleteAccount', async (userId) => {
        try {
            const query = 'DELETE FROM `user` WHERE `id` = ?';
            await db.execute(query, [userId]);
    
            console.log('Account Deleted!');
            socket.emit('accountDeleted');
        } catch (error) {
            console.error('MySQL query error:', error);
            socket.emit('accountDeleted', { error: 'Failed to delete account' });
        }
    });
    
    socket.on('blockAccount', async (userId) => {
        try {
            // Check the current accstatus
            const checkQuery = 'SELECT `accstatus` FROM `user` WHERE `id` = ?';
            const [checkResults] = await db.execute(checkQuery, [userId]);
    
            if (checkResults.length > 0) {
                const currentAccStatus = checkResults[0].accstatus;
    
                // Update accstatus based on its current value
                const newAccStatus = (currentAccStatus === 1) ? 0 : 1;
    
                // Update the accstatus
                const updateQuery = 'UPDATE `user` SET `accstatus` = ? WHERE `id` = ?';
                await db.execute(updateQuery, [newAccStatus, userId]);
    
                console.log('Account status updated!');
                socket.emit('accountUpdated');
            } else {
                console.log('User not found');
                socket.emit('accountUpdated', { error: 'User not found' });
            }
        } catch (error) {
            console.error('MySQL query error:', error);
            socket.emit('accountUpdated', { error: 'Failed to update account status' });
        }
    });
    
    socket.on('retrieveRecords', async (data) => {
        try {
            const { uid, year } = data;
    
            const query = 'SELECT r.*, u.fname AS userfname, u.mname AS usermname, u.lname AS userlname FROM records r JOIN user u ON r.uid = u.id WHERE u.admin_id = ? AND YEAR(r.dateassess) = ?';
            const [results] = await db.execute(query, [uid, year]);
    
            socket.emit('getRecords', results);
        } catch (error) {
            console.error('MySQL query error:', error);
            socket.emit('getRecords', { error: 'Failed to retrieve records' });
        }
    });
    
    socket.on('deleteRecord', async (recordId) => {
        try {
            const query = 'DELETE FROM `records` WHERE `id`= ?';
            await db.execute(query, [recordId]);
    
            console.log('Record deleted successfully');
            socket.emit('recordsUpdated');
        } catch (error) {
            console.error('MySQL query error:', error);
        }
    });
    
    socket.on('changeContact', async (data) => {
        const { recordId, newcontact } = data;
        
        try {
            const query = 'UPDATE `records` SET `contact` = ? WHERE `id` = ?';
            await db.execute(query, [newcontact, recordId]);
    
            console.log('Record Contact updated successfully');
        } catch (error) {
            console.error('MySQL query error:', error);
        }
    });

    socket.on('notificationRead', async (data) => {
        const { id } = data;
    
        try {
            const query = 'UPDATE `log` SET `status` = "old" WHERE `id` = ?';
            await db.execute(query, [id]);
    
            console.log('Log Read');
        } catch (error) {
            console.error('MySQL query error:', error);
        }
    });

    socket.on('clearNotification', async (data) => {
        const { admin_id } = data;
        try {
            const query = 'DELETE FROM `log` WHERE `admin_id` = ?';
            await db.execute(query, [admin_id]);
    
            console.log('Notifications Cleared Successfully');
        } catch (error) {
            console.error('MySQL query error:', error);
        }
    });
    
    socket.on('changeFirstName', async (data) => {
        const { recordId, newName } = data;
    
        try {
            const query = 'UPDATE `records` SET `fname` = ? WHERE `id` = ?';
            await db.execute(query, [newName, recordId]);
    
            console.log('Record First Name updated successfully');
            socket.emit('recordsUpdated');
        } catch (error) {
            console.error('MySQL query error:', error);
            socket.emit('recordsUpdated', { error: 'Failed to update first name' });
        }
    });

    //Realtime Records Data Funtionality
    socket.on('checkNotification', async (data) => {
        try {
            const { adminid } = data;
    
            const query = 'SELECT COUNT(*) AS new_status_count FROM log WHERE status = "new" AND admin_id = ?';
            const [response] = await db.execute(query, [adminid]);
    
            if (response.length > 0) {
                const count = response[0].new_status_count; // Use consistent notation
                socket.emit('checkNotificationResponse', { statuscount: count });
            } else {
                console.error('No response from the database query.');
            }
        } catch (error) {
            console.error('Error executing MySQL query:', error);
        }
    });


    
    socket.on('changeMiddleName', async (data) => {
        const { recordId, newName } = data;
    
        try {
            const query = 'UPDATE `records` SET `mname` = ? WHERE `id` = ?';
            await db.execute(query, [newName, recordId]);
    
            console.log('Record Middle Name updated successfully');
            socket.emit('recordsUpdated');
        } catch (error) {
            console.error('MySQL query error:', error);
            socket.emit('recordsUpdated', { error: 'Failed to update middle name' });
        }
    });
    
    socket.on('changeLastName', async (data) => {
        const { recordId, newName } = data;
    
        try {
            const query = 'UPDATE `records` SET `lname` = ? WHERE `id` = ?';
            await db.execute(query, [newName, recordId]);
    
            console.log('Record Last Name updated successfully');
            socket.emit('recordsUpdated');
        } catch (error) {
            console.error('MySQL query error:', error);
            socket.emit('recordsUpdated', { error: 'Failed to update last name' });
        }
    });
    
    socket.on('changeContact', async (data) => {
        const { recordId, newcontact } = data;
    
        try {
            const query = 'UPDATE `records` SET `contact` = ? WHERE `id` = ?';
            await db.execute(query, [newcontact, recordId]);
    
            console.log('Record Contact updated successfully');
            socket.emit('recordsUpdated');
        } catch (error) {
            console.error('MySQL query error:', error);
            socket.emit('recordsUpdated', { error: 'Failed to update contact' });
        }
    });
    
    socket.on('changeAddress', async (data) => {
        const { recordId, newaddress } = data;
    
        try {
            const query = 'UPDATE `records` SET `address` = ? WHERE `id` = ?';
            await db.execute(query, [newaddress, recordId]);
    
            console.log('Record Address updated successfully');
            socket.emit('recordsUpdated');
        } catch (error) {
            console.error('MySQL query error:', error);
            socket.emit('recordsUpdated', { error: 'Failed to update address' });
        }
    });
    
    socket.on('getDataDashboard', async (data) => {
        const { uid, year } = data;
    
        try {
            const query = 'SELECT r.*, u.fname AS userfname, u.mname AS usermname, u.lname AS userlname FROM records r JOIN user u ON r.uid = u.id WHERE u.admin_id = ? AND YEAR(r.dateassess) = ?';
            const [results] = await db.execute(query, [uid, year]);
    
            if (results.length > 0) {
                socket.emit('loadDatatoDashboard', results);
            } else {
                socket.emit('noDataToLoad', results);
            }
        } catch (error) {
            console.error('MySQL query error:', error);
            socket.emit('noDataToLoad', { error: 'Failed to load data to dashboard' });
        }
    });

    socket.on('getLog', async (data) => {
        const { id } = data
        try {
            const query = 'SELECT * FROM `log` WHERE `admin_id` = ?';
            const [results] = await db.execute(query, [id]);

            socket.emit('retrievelog', results);
        } catch (error) {
            console.error('MySQL query error:', error);
        }
    });
    
    socket.on('getUserData', async (uid) => {
        try {
            const query = 'SELECT a.*, COUNT(r.id) AS total_records, COUNT(DISTINCT u.id) AS total_users FROM user a JOIN user u ON a.id = u.admin_id LEFT JOIN records r ON u.id = r.uid WHERE a.id = ? GROUP BY a.id, a.type, u.id, u.type';
            const [results] = await db.execute(query, [uid]);
    
            if (results.length > 0) {
                const { id, type, fname, mname, lname, affiliation, email, username, facility, accstatus, image, total_records, total_users } = results[0];
                const imageData = image ? image.toString('base64') : '';
                
                console.log('User Data Retrieved!');
                console.log(results);
    
                socket.emit('retrieveUserData', { id, type, fname, mname, lname, affiliation, email, username, facility, accstatus, image: imageData, total_records, total_users });
            } else {
                console.log('User not found');
                socket.emit('retrieveUserData', { error: 'User not found' });
            }
        } catch (error) {
            console.error('MySQL query error:', error);
            socket.emit('retrieveUserData', { error: 'Failed to retrieve user data' });
        }
    });
    

    socket.on('verifyPassword', async (data) => {
        try {
            const { uid, enteredPassword } = data;
    
            // For hashing password with Salt
            function hashPassword(password, salt) {
                const hmac = crypto.createHmac('sha256', salt);
                const hashedPassword = hmac.update(password).digest('hex');
                return hashedPassword;
            }
    
            const query = 'SELECT * FROM `user` WHERE `id` = ? AND `type` = "admin"';
            const [results] = await db.execute(query, [uid]);
    
            if (results.length > 0) {
                const storedPasswordHash = results[0]['password_hash'];
                const storedSalt = results[0]['salt'];
    
                const hashedEnteredPassword = hashPassword(enteredPassword, storedSalt);
    
                if (hashedEnteredPassword === storedPasswordHash) {
                    // Password is correct
                    console.log('Authentication successful');
                    socket.emit('verificationResponse', { verification: 1 });
                } else {
                    // Password is incorrect
                    console.log('Authentication failed');
                    socket.emit('verificationResponse', { verification: 0 });
                }
            } else {
                console.log('User not found');
            }
        } catch (error) {
            console.error('MySQL query error:', error);
            socket.emit('verificationResponse', { verification: -1, error: 'Failed to verify password' });
        }
    });
    

    socket.on('updateSecurity', async (data) => {
        const { uid, email, username, newpassword } = data;
    
        try {
            if (email) {
                await db.execute('UPDATE `user` SET `email` = ? WHERE `id`= ?', [email, uid]);
            }
    
            if (username) {
                await db.execute('UPDATE `user` SET `username` = ? WHERE `id`= ?', [username, uid]);
            }
    
            if (newpassword) {
                const [userData] = await db.execute('SELECT * FROM `user` WHERE `id` = ?', [uid]);
                
                if (userData.length > 0) {
                    const storedSalt = userData[0]['salt'];
                    function hashPassword(password, salt) {
                        const hmac = crypto.createHmac('sha256', salt);
                        return hmac.update(password).digest('hex');
                    }
    
                    const hashednewpassword = hashPassword(newpassword, storedSalt);
                    await db.execute('UPDATE `user` SET `password_hash` = ? WHERE `id`= ?', [hashednewpassword, uid]);
                }
            }
    
            const [updatedUserData] = await db.execute('SELECT `id`, `type`, `fname`, `mname`, `lname`, `affiliation`, `email`, `username`,`facility`, `accstatus`, `image` FROM `user` WHERE `id` = ?', [uid]);
    
            console.log('User Details updated!');
            socket.emit('retrieveUserData', updatedUserData);
        } catch (error) {
            console.error('MySQL query error:', error);
            socket.emit('retrieveUserData', { error: 'Failed to update user details' });
        }
    });
    

    socket.on('uploadProfile', async (data) => {
        const { uid, image } = data;
    
        try {
            const query = 'UPDATE `user` SET `image` = ? WHERE `id`= ?';
            await db.execute(query, [image, uid]);
    
            console.log('Profile Image Updated!');
            socket.emit('profileUpdated', { success: true, message: 'Profile image updated successfully' });
        } catch (error) {
            console.error('MySQL query error:', error);
            socket.emit('profileUpdated', { success: false, message: 'Failed to update profile image' });
        }
    });
    

    socket.on('updateBio', async (data) => {
        const { uid, newfname, newmname, newlname, newaffiliation } = data;
    
        try {
            // Update first name
            const [response] = await db.execute('UPDATE `user` SET `fname` = ?, `mname` = ?, `lname` = ?, `affiliation` = ? WHERE `id`= ?', [newfname, newmname, newlname, newaffiliation, uid]);
    
            console.log('User Bio Updated!');

            socket.emit('bioUpdated', response);
        } catch (error) {
            console.error('MySQL query error:', error);
        }
    });
    
    
    socket.on('getaddresses', async (uid) => {
        try {
            const query = 'SELECT * FROM `address` WHERE `admin_id` = ?';
            const [results] = await db.execute(query, [uid]);
    
            console.log('Address Data Retrieved!');
            socket.emit('retrieveaddresses', results);
        } catch (error) {
            console.error('MySQL query error:', error);
            socket.emit('retrieveaddresses', { error: 'Failed to retrieve addresses' });
        }
    });
    
    socket.on('changeAddress', async (data) => {
        const { uid, addressid, newaddress } = data;
    
        try {
            // Update address
            await db.execute('UPDATE `address` SET `address`= ? WHERE `id`= ?', [newaddress, addressid]);
    
            console.log('Address Updated!');
    
            // Retrieve updated addresses
            const query = 'SELECT * FROM `address` WHERE `admin_id` = ?';
            const [results] = await db.execute(query, [uid]);
    
            console.log('Address Data Retrieved!');
            socket.emit('retrieveaddresses', results);
        } catch (error) {
            console.error('MySQL query error:', error);
            socket.emit('retrieveaddresses', { error: 'Failed to update address' });
        }
    });
    
    socket.on('deleteAddress', async (data) => {
        const { uid, addressId } = data;
    
        try {
            // Delete address
            await db.execute('DELETE FROM `address` WHERE  `id` = ?', [addressId]);
    
            console.log('Address Deleted!');
    
            // Retrieve updated addresses
            const query = 'SELECT * FROM `address` WHERE `admin_id` = ?';
            const [results] = await db.execute(query, [uid]);
    
            console.log('Address Data Retrieved!');
            socket.emit('retrieveaddresses', results);
        } catch (error) {
            console.error('MySQL query error:', error);
            socket.emit('retrieveaddresses', { error: 'Failed to delete address' });
        }
    });
    
    socket.on('addAddress', async (data) => {
        const { adminid, address, facility } = data;
    
        try {
            // Add new address
            await db.execute('INSERT INTO `address`(`admin_id`, `facility`, `address`) VALUES (?,?,?)', [adminid, facility, address]);
    
            console.log('Address Added!');
    
            // Retrieve updated addresses
            const query = 'SELECT * FROM `address` WHERE `admin_id` = ?';
            const [results] = await db.execute(query, [adminid]);
    
            console.log('Address Data Retrieved!');
            socket.emit('retrieveaddresses', results);
        } catch (error) {
            console.error('MySQL query error:', error);
            socket.emit('retrieveaddresses', { error: 'Failed to add address' });
        }
    });
    
    socket.on('changeFacility', async (data) => {
        const { uid, facility } = data;
    
        try {
            // Update user's facility
            await db.execute('UPDATE `user` SET `facility`= ? WHERE `id`= ?', [facility, uid]);
    
            console.log('Facility Changed!');
    
            // Retrieve updated user details
            const query = 'SELECT `id`, `type`, `fname`, `mname`, `lname`, `affiliation`, `email`, `username`,`facility`, `accstatus`, `image`FROM `user` WHERE `id` = ?';
            const [results] = await db.execute(query, [uid]);
    
            console.log('User Details Updated!');
            socket.emit('retrieveUserData', results);
        } catch (error) {
            console.error('MySQL query error:', error);
            socket.emit('retrieveUserData', { error: 'Failed to update facility' });
        }
    });

    socket.on('checkEmail', async (data) => {
        const { email } = data;
    
        try {
            // Update user's facility
            const [results] = await db.execute('SELECT * FROM `user` WHERE `email`= ?', [email]);
            if (results.length > 0){
             console.log('User Already Existed!'); 
                socket.emit('emailResponse', 1);  
            }
            else{
                console.log('User dont Exist!');
                socket.emit('emailResponse', 0);   
            }
        } catch (error) {
            console.error('MySQL query error:', error);
            socket.emit('Email check Error:', { error: 'Failed to update facility' });
        }
    });

    //User Account Creation
    socket.on('createUserAccount', async (data) => {
        const { fname, mname, lname, email, facility, affiliation, password, adminid} = data;

        try {
            // Check if the email already exists
                function hashPassword(password, salt) {
                    const hmac = crypto.createHmac('sha256', salt);
                    const hashedPassword = hmac.update(password).digest('hex');
                    return hashedPassword;
                }
        
                function generateSalt() {
                    return crypto.randomBytes(16).toString('base64');
                }
                
             
                // Generate salt and hash password
                const generatedSalt = generateSalt();
                const hashedPassword = hashPassword(password, generatedSalt);
                    
                // Insert the new user into the database
                const insertQuery = 'INSERT INTO `user`(`type`, `fname`, `mname`, `lname`, `affiliation`, `email`, `username`, `password_hash`, `salt`, `facility`, `accstatus`,`admin_id`) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)';
                const userCreated = await db.execute(insertQuery, ['user', fname, mname, lname, affiliation, email, email, hashedPassword, generatedSalt, facility, 0, adminid]);

                // Successful account creation
                if (userCreated) {
                    socket.emit('accountCreated', { response: 0 });
                } else {
                    socket.emit('accountCreated', { response: 1 });
                    console.log('fname:', fname);
                    console.log('mname:', mname);
                    console.log('lname:', lname);
                    console.log('email:', email);
                    console.log('facility:', facility);
                    console.log('affiliation:', affiliation);
                    console.log('password:', password);
                    console.log('adminid:', adminid);
                }
        } catch (error) {
            console.error('MySQL query error:', error);
            socket.emit('accountCreated', { response: 1 });
        }
    });

    
    
    //Admin Account Creation
    socket.on('createAccount', async (data) => {
        const { fname, mname, lname, email, facility, affiliation, password } = data;

        function hashPassword(password, salt) {
            const hmac = crypto.createHmac('sha256', salt);
            const hashedPassword = hmac.update(password).digest('hex');
            return hashedPassword;
        }

        function generateSalt() {
            return crypto.randomBytes(16).toString('base64');
        }

        try {
            // Check if the email already exists
            const [existingUsers] = await db.execute('SELECT * FROM `user` WHERE `email` = ?', [email]);

            if (existingUsers.length > 0) {
                // Email already exists
                socket.emit('accountCreated', { response: 1 });
            } else {
                // Generate salt and hash password
                const generatedSalt = generateSalt();
                const hashedPassword = hashPassword(password, generatedSalt);
                    
                // Insert the new user into the database
                const insertQuery = 'INSERT INTO `user`(`type`, `fname`, `mname`, `lname`, `affiliation`, `email`, `username`, `password_hash`, `salt`, `facility`, `accstatus`) VALUES (?,?,?,?,?,?,?,?,?,?,?)';
                await db.execute(insertQuery, ['admin', fname, mname, lname, affiliation, email, email, hashedPassword, generatedSalt, facility, 0]);

                // Successful account creation
                socket.emit('accountCreated', { response: 0 });
            }
        } catch (error) {
            console.error('MySQL query error:', error);
            socket.emit('accountCreated', { response: 1 });
        }
    });
   
    //Login

    socket.on('verifyCredentials', async (data) => {
        const { username, enteredpassword } = data;
    
        try {
            const query = 'SELECT * FROM `user` WHERE `type` = "admin" AND (`username` = ? OR `email` = ?)';
            const [results] = await db.execute(query, [username, username]);

            function hashPassword(password, salt) {
                const hmac = crypto.createHmac('sha256', salt);
                const hashedPassword = hmac.update(password).digest('hex');
                return hashedPassword;
            }
    
            if (results.length > 0) {
                const user = results[0];
                const uid = user['id'];
                const facility = user['facility'];
                const fname = user['fname'];
                const mname = user['mname'];
                const lname = user['lname'];
                const imageBuffer = user['image'];
                const imageBase64 = imageBuffer ? imageBuffer.toString('base64') : '';
                const storedSalt = user['salt'];
                const storedPassword = user['password_hash'];
                const hashedEnteredPassword = hashPassword(enteredpassword, storedSalt);
    
                if (hashedEnteredPassword === storedPassword) {
                    console.log('Login Successfully!');
    
                    // Generate JWT token
                    const secretKey = 'health_i1988!'; // Replace with your actual secret key
                    const token = jwt.sign({ uid, username, facility }, secretKey, { expiresIn: '1h' });
    
                    // Emit a successful verification response along with the token
                    socket.emit('verificationResponse', {
                        response: 1,
                        uid: uid,
                        token: token,
                        facility: facility,
                        fname: fname,
                        mname: mname,
                        lname: lname,
                        image: imageBase64
                    });
                    return;
                } else {
                    console.log('Wrong Username or Password!');
                    // Incorrect password response
                    socket.emit('verificationResponse', { response: 2 });
                }
            } else {
                console.log('No results found for the given username!');
                // No user found response
                socket.emit('verificationResponse', { response: 3 });
            }
        } catch (error) {
            console.error('Unexpected error:', error);
            socket.emit('verificationResponse', { response: 4 }); // Some error occurred
        }
    });
    
    

    socket.on('disconnect', () => {
        console.log('A user disconnected');
    });
});

const port = process.env.PORT || 3000; // Set the port number you want to use
server.listen(port, () => {
    console.log(`Socket.IO Server is running on port ${port}`);
});





