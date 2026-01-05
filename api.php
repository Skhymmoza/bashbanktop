<?php
// --- КОНФИГУРАЦИЯ (ИЗМЕНИТЕ ПОД СЕБЯ) ---
define('DB_HOST', 'localhost');
define('DB_NAME', 'u123456_bashbank'); // Ваша база
define('DB_USER', 'u123456_user');     // Ваш юзер
define('DB_PASS', 'password');         // Ваш пароль
define('JWT_SECRET', 'kurai_flower_secret_key');

// --- ЗАГОЛОВКИ ---
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: POST, GET");

// --- ПОДКЛЮЧЕНИЕ К БД ---
function getDB() {
    try {
        $pdo = new PDO("mysql:host=".DB_HOST.";dbname=".DB_NAME.";charset=utf8", DB_USER, DB_PASS);
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        return $pdo;
    } catch(PDOException $e) {
        http_response_code(500);
        die(json_encode(["error" => "Ошибка подключения к БД"]));
    }
}

// --- JWT HELPER ---
class JWT {
    public static function encode($payload) {
        $base64UrlHeader = str_replace(['+', '/', '='], ['-', '_', ''], base64_encode(json_encode(['typ' => 'JWT', 'alg' => 'HS256'])));
        $base64UrlPayload = str_replace(['+', '/', '='], ['-', '_', ''], base64_encode(json_encode($payload)));
        $signature = hash_hmac('sha256', $base64UrlHeader . "." . $base64UrlPayload, JWT_SECRET, true);
        $base64UrlSignature = str_replace(['+', '/', '='], ['-', '_', ''], base64_encode($signature));
        return $base64UrlHeader . "." . $base64UrlPayload . "." . $base64UrlSignature;
    }
    public static function decode($token) {
        $parts = explode('.', $token);
        if (count($parts) != 3) return null;
        $signature = hash_hmac('sha256', $parts[0] . "." . $parts[1], JWT_SECRET, true);
        $base64UrlSignature = str_replace(['+', '/', '='], ['-', '_', ''], base64_encode($signature));
        if ($base64UrlSignature === $parts[2]) {
            return json_decode(base64_decode(str_replace(['-', '_'], ['+', '/'], $parts[1])), true);
        }
        return null;
    }
}

// --- ЛОГИКА ---
$act = $_GET['act'] ?? '';
$pdo = getDB();
$input = json_decode(file_get_contents("php://input"), true);

// Auth Check
$userId = null;
$headers = getallheaders();
if (isset($headers['Authorization'])) {
    $token = str_replace('Bearer ', '', $headers['Authorization']);
    $payload = JWT::decode($token);
    if ($payload) $userId = $payload['user_id'];
}

// 1. РЕГИСТРАЦИЯ
if ($act === 'register') {
    $passHash = password_hash($input['password'], PASSWORD_DEFAULT);
    // Генерация карты (Алгоритм Луна упрощенный)
    $prefix = "2202"; // Код Башкирии (условно)
    $cardNum = $prefix . mt_rand(100000000000, 999999999999);
    
    try {
        $pdo->beginTransaction();
        $stmt = $pdo->prepare("INSERT INTO users (full_name, login, password_hash, phone) VALUES (?, ?, ?, ?)");
        $stmt->execute([$input['full_name'], $input['login'], $passHash, $input['phone']]);
        $uid = $pdo->lastInsertId();
        
        $pdo->prepare("INSERT INTO bank_cards (user_id, card_number, cvv_hash, expiry_date) VALUES (?, ?, ?, ?)")
            ->execute([$uid, $cardNum, 'hash', date("m/y", strtotime("+4 years"))]);
        
        $pdo->commit();
        echo json_encode(["status" => "success"]);
    } catch (Exception $e) {
        $pdo->rollBack();
        echo json_encode(["error" => "Логин занят"]);
    }
    exit;
}

// 2. ВХОД
if ($act === 'login') {
    $stmt = $pdo->prepare("SELECT * FROM users WHERE login = ?");
    $stmt->execute([$input['login']]);
    $user = $stmt->fetch();
    
    if ($user && password_verify($input['password'], $user['password_hash'])) {
        echo json_encode(["token" => JWT::encode(['user_id' => $user['id']])]);
    } else {
        http_response_code(401);
        echo json_encode(["error" => "Неверный пароль"]);
    }
    exit;
}

// 3. ДАННЫЕ ПОЛЬЗОВАТЕЛЯ
if ($act === 'me' && $userId) {
    $stmt = $pdo->prepare("SELECT u.full_name, c.card_number, c.balance FROM users u JOIN bank_cards c ON u.id = c.user_id WHERE u.id = ?");
    $stmt->execute([$userId]);
    echo json_encode($stmt->fetch(PDO::FETCH_ASSOC));
    exit;
}

// 4. ПЕРЕВОД
if ($act === 'transfer' && $userId) {
    $to = $input['to_card'];
    $sum = (float)$input['amount'];
    
    try {
        $pdo->beginTransaction();
        $stmtSender = $pdo->prepare("SELECT id, balance FROM bank_cards WHERE user_id = ? FOR UPDATE");
        $stmtSender->execute([$userId]);
        $sender = $stmtSender->fetch();
        
        $stmtRec = $pdo->prepare("SELECT id FROM bank_cards WHERE card_number = ?");
        $stmtRec->execute([$to]);
        $rec = $stmtRec->fetch();
        
        if (!$rec) throw new Exception("Карта получателя не найдена");
        if ($sender['balance'] < $sum) throw new Exception("Недостаточно средств (Акча юк)");
        if ($sender['id'] == $rec['id']) throw new Exception("Нельзя перевести себе");

        $pdo->prepare("UPDATE bank_cards SET balance = balance - ? WHERE id = ?")->execute([$sum, $sender['id']]);
        $pdo->prepare("UPDATE bank_cards SET balance = balance + ? WHERE id = ?")->execute([$sum, $rec['id']]);
        $pdo->prepare("INSERT INTO transactions (sender_card_id, receiver_card_id, amount, description) VALUES (?, ?, ?, ?)")
            ->execute([$sender['id'], $rec['id'], $sum, "Перевод"]);
            
        $pdo->commit();
        echo json_encode(["status" => "success"]);
    } catch (Exception $e) {
        $pdo->rollBack();
        echo json_encode(["error" => $e->getMessage()]);
    }
    exit;
}

// 5. ИСТОРИЯ
if ($act === 'history' && $userId) {
    $stmt = $pdo->prepare("SELECT t.amount, t.description, t.created_at, 
        CASE WHEN c.user_id = ? THEN 'outcome' ELSE 'income' END as type
        FROM transactions t 
        JOIN bank_cards c ON t.sender_card_id = c.id
        WHERE t.sender_card_id = (SELECT id FROM bank_cards WHERE user_id = ?) 
           OR t.receiver_card_id = (SELECT id FROM bank_cards WHERE user_id = ?)
        ORDER BY t.created_at DESC LIMIT 10");
    $stmt->execute([$userId, $userId, $userId]);
    echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
    exit;
}
?>
