import Debug "mo:base/Debug";
import HashMap "mo:base/HashMap";
import Principal "mo:base/Principal";
import Time "mo:base/Time";
import Array "mo:base/Array";
import Iter "mo:base/Iter";
import Option "mo:base/Option";
import Result "mo:base/Result";
import Nat "mo:base/Nat";
import Nat32 "mo:base/Nat32";

actor BitSplit {
    
    // Types
    public type UserId = Principal;
    
    public type SplitSettings = {
        spendPercent: Nat;
        savePercent: Nat;
        investPercent: Nat;
    };
    
    public type UserBalance = {
        spend: Nat;
        save: Nat;
        invest: Nat;
        total: Nat;
    };
    
    public type Transaction = {
        id: Nat;
        userId: UserId;
        amount: Nat;
        timestamp: Int;
        transactionType: {#income; #spend; #save; #invest};
        description: Text;
    };
    
    public type UserProfile = {
        userId: UserId;
        splitSettings: SplitSettings;
        balance: UserBalance;
        createdAt: Int;
        lastActive: Int;
    };
    
    // Storage
    private stable var nextTransactionId: Nat = 0;
    private var users = HashMap.HashMap<UserId, UserProfile>(10, Principal.equal, Principal.hash);
    private var transactions = HashMap.HashMap<Nat, Transaction>(100, func(a: Nat, b: Nat): Bool { a == b }, func(n: Nat): Nat32 { Nat32.fromNat(n % 4294967296) });
    
    // Default split settings (50% spend, 30% save, 20% invest)
    private let defaultSplitSettings: SplitSettings = {
        spendPercent = 50;
        savePercent = 30;
        investPercent = 20;
    };
    
    // Initialize user profile
    public shared(msg) func initializeUser(): async Result.Result<UserProfile, Text> {
        let userId = msg.caller;
        
        switch (users.get(userId)) {
            case (?existingUser) {
                #ok(existingUser)
            };
            case null {
                let newUser: UserProfile = {
                    userId = userId;
                    splitSettings = defaultSplitSettings;
                    balance = {
                        spend = 0;
                        save = 0;
                        invest = 0;
                        total = 0;
                    };
                    createdAt = Time.now();
                    lastActive = Time.now();
                };
                users.put(userId, newUser);
                #ok(newUser)
            };
        }
    };
    
    // Get user profile
    public shared(msg) func getUserProfile(): async Result.Result<UserProfile, Text> {
        let userId = msg.caller;
        switch (users.get(userId)) {
            case (?user) { #ok(user) };
            case null { #err("User not found. Please initialize first.") };
        }
    };
    
    // Update split settings
    public shared(msg) func updateSplitSettings(newSettings: SplitSettings): async Result.Result<Text, Text> {
        let userId = msg.caller;
        
        // Validate percentages add up to 100
        if (newSettings.spendPercent + newSettings.savePercent + newSettings.investPercent != 100) {
            return #err("Split percentages must add up to 100%");
        };
        
        switch (users.get(userId)) {
            case (?user) {
                let updatedUser: UserProfile = {
                    userId = user.userId;
                    splitSettings = newSettings;
                    balance = user.balance;
                    createdAt = user.createdAt;
                    lastActive = Time.now();
                };
                users.put(userId, updatedUser);
                #ok("Split settings updated successfully")
            };
            case null { #err("User not found") };
        }
    };
    
    // Process incoming ckBTC (auto-split)
    public shared(msg) func processIncome(amount: Nat): async Result.Result<UserBalance, Text> {
        let userId = msg.caller;
        
        switch (users.get(userId)) {
            case (?user) {
                let settings = user.splitSettings;
                
                // Calculate split amounts
                let spendAmount = (amount * settings.spendPercent) / 100;
                let saveAmount = (amount * settings.savePercent) / 100;
                let investAmount = (amount * settings.investPercent) / 100;
                
                // Update balances
                let newBalance: UserBalance = {
                    spend = user.balance.spend + spendAmount;
                    save = user.balance.save + saveAmount;
                    invest = user.balance.invest + investAmount;
                    total = user.balance.total + amount;
                };
                
                // Update user profile
                let updatedUser: UserProfile = {
                    userId = user.userId;
                    splitSettings = user.splitSettings;
                    balance = newBalance;
                    createdAt = user.createdAt;
                    lastActive = Time.now();
                };
                users.put(userId, updatedUser);
                
                // Create transaction record
                let transaction: Transaction = {
                    id = nextTransactionId;
                    userId = userId;
                    amount = amount;
                    timestamp = Time.now();
                    transactionType = #income;
                    description = "Income auto-split: " # Nat.toText(spendAmount) # " spend, " # 
                                  Nat.toText(saveAmount) # " save, " # Nat.toText(investAmount) # " invest";
                };
                transactions.put(nextTransactionId, transaction);
                nextTransactionId += 1;
                
                #ok(newBalance)
            };
            case null { #err("User not found") };
        }
    };
    
    // Spend from spend balance
    public shared(msg) func spendFunds(amount: Nat, description: Text): async Result.Result<UserBalance, Text> {
        let userId = msg.caller;
        
        switch (users.get(userId)) {
            case (?user) {
                if (user.balance.spend < amount) {
                    return #err("Insufficient spend balance");
                };
                
                let newBalance: UserBalance = {
                    spend = user.balance.spend - amount;
                    save = user.balance.save;
                    invest = user.balance.invest;
                    total = user.balance.total - amount;
                };
                
                let updatedUser: UserProfile = {
                    userId = user.userId;
                    splitSettings = user.splitSettings;
                    balance = newBalance;
                    createdAt = user.createdAt;
                    lastActive = Time.now();
                };
                users.put(userId, updatedUser);
                
                // Record transaction
                let transaction: Transaction = {
                    id = nextTransactionId;
                    userId = userId;
                    amount = amount;
                    timestamp = Time.now();
                    transactionType = #spend;
                    description = description;
                };
                transactions.put(nextTransactionId, transaction);
                nextTransactionId += 1;
                
                #ok(newBalance)
            };
            case null { #err("User not found") };
        }
    };
    
    // Get user transactions
    public shared(msg) func getUserTransactions(): async [Transaction] {
        let userId = msg.caller;
        let userTxs = Array.filter<Transaction>(
            Iter.toArray(transactions.vals()),
            func(tx: Transaction): Bool { tx.userId == userId }
        );
        Array.sort(userTxs, func(a: Transaction, b: Transaction): { #less; #equal; #greater } {
            if (a.timestamp > b.timestamp) { #less }
            else if (a.timestamp < b.timestamp) { #greater }
            else { #equal }
        })
    };
    
    // Transfer between categories (save to spend, etc.)
    public shared(msg) func transferBetweenCategories(
        fromCategory: {#spend; #save; #invest},
        toCategory: {#spend; #save; #invest},
        amount: Nat
    ): async Result.Result<UserBalance, Text> {
        let userId = msg.caller;
        
        if (fromCategory == toCategory) {
            return #err("Cannot transfer to the same category");
        };
        
        switch (users.get(userId)) {
            case (?user) {
                let balance = user.balance;
                let fromAmount = switch (fromCategory) {
                    case (#spend) { balance.spend };
                    case (#save) { balance.save };
                    case (#invest) { balance.invest };
                };
                
                if (fromAmount < amount) {
                    return #err("Insufficient balance in source category");
                };
                
                let newBalance: UserBalance = switch (fromCategory, toCategory) {
                    case (#spend, #save) {
                        { spend = balance.spend - amount; save = balance.save + amount; invest = balance.invest; total = balance.total }
                    };
                    case (#spend, #invest) {
                        { spend = balance.spend - amount; save = balance.save; invest = balance.invest + amount; total = balance.total }
                    };
                    case (#save, #spend) {
                        { spend = balance.spend + amount; save = balance.save - amount; invest = balance.invest; total = balance.total }
                    };
                    case (#save, #invest) {
                        { spend = balance.spend; save = balance.save - amount; invest = balance.invest + amount; total = balance.total }
                    };
                    case (#invest, #spend) {
                        { spend = balance.spend + amount; save = balance.save; invest = balance.invest - amount; total = balance.total }
                    };
                    case (#invest, #save) {
                        { spend = balance.spend; save = balance.save + amount; invest = balance.invest - amount; total = balance.total }
                    };
                    case _ { balance }; // This case should never happen
                };
                
                let updatedUser: UserProfile = {
                    userId = user.userId;
                    splitSettings = user.splitSettings;
                    balance = newBalance;
                    createdAt = user.createdAt;
                    lastActive = Time.now();
                };
                users.put(userId, updatedUser);
                
                #ok(newBalance)
            };
            case null { #err("User not found") };
        }
    };
    
    // Get system stats (for admin/debugging)
    public query func getSystemStats(): async {totalUsers: Nat; totalTransactions: Nat} {
        {
            totalUsers = users.size();
            totalTransactions = transactions.size();
        }
    };
}