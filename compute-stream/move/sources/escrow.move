module computestream::escrow {
  use std::signer;
  use aptos_framework::coin;
  use aptos_framework::aptos_coin::AptosCoin;
  use aptos_framework::table::{Self, Table};

  /// Error codes
  const E_ESCROW_NOT_FOUND: u64 = 1;
  const E_NOT_AUTHORIZED: u64 = 2;
  const E_INSUFFICIENT_BALANCE: u64 = 3;
  const E_ESCROW_ALREADY_EXISTS: u64 = 4;
  const E_INVALID_AMOUNT: u64 = 5;

  /// Escrow state for a job - holds the actual coins
  struct EscrowAccount has store {
    job_id: u64,
    buyer_address: address,
    provider_address: address,
    total_amount: u64,
    released_amount: u64,
    is_active: bool,
    coins: coin::Coin<AptosCoin>,  // Actually holds the coins
  }

  /// Container for storing multiple escrows per buyer
  struct EscrowStore has key {
    escrows: Table<u64, EscrowAccount>,
  }

  /// Deposit escrow for a job - locks coins
  public entry fun deposit_escrow(
    buyer: &signer,
    job_id: u64,
    provider_address: address,
    amount: u64,
  ) acquires EscrowStore {
    let buyer_addr = signer::address_of(buyer);
    
    // Validate amount
    assert!(amount > 0, E_INVALID_AMOUNT);
    
    // Initialize escrow store if it doesn't exist
    if (!exists<EscrowStore>(buyer_addr)) {
      move_to(buyer, EscrowStore {
        escrows: table::new(),
      });
    };
    
    // Get escrow store
    let escrow_store = borrow_global_mut<EscrowStore>(buyer_addr);
    
    // Check if escrow already exists for this job
    assert!(!table::contains(&escrow_store.escrows, job_id), E_ESCROW_ALREADY_EXISTS);
    
    // Withdraw coins from buyer's account
    let coins = coin::withdraw<AptosCoin>(buyer, amount);
    
    // Create escrow account that holds the coins
    let escrow = EscrowAccount {
      job_id,
      buyer_address: buyer_addr,
      provider_address,
      total_amount: amount,
      released_amount: 0,
      is_active: true,
      coins,
    };
    
    // Store escrow in table
    table::add(&mut escrow_store.escrows, job_id, escrow);
  }

  /// Release payment to provider (called during streaming or at completion)
  public entry fun release_payment(
    buyer: &signer,
    job_id: u64,
    amount: u64,
  ) acquires EscrowStore {
    let buyer_addr = signer::address_of(buyer);
    
    let escrow_store = borrow_global_mut<EscrowStore>(buyer_addr);
    assert!(table::contains(&escrow_store.escrows, job_id), E_ESCROW_NOT_FOUND);
    
    let escrow = table::borrow_mut(&mut escrow_store.escrows, job_id);
    
    // Verify escrow is active
    assert!(escrow.is_active, E_NOT_AUTHORIZED);
    
    // Verify sufficient balance
    let remaining = escrow.total_amount - escrow.released_amount;
    assert!(remaining >= amount, E_INSUFFICIENT_BALANCE);
    
    // Extract coins from escrow
    let payment = coin::extract(&mut escrow.coins, amount);
    
    // Transfer coins to provider
    coin::deposit(escrow.provider_address, payment);
    
    // Update released amount
    escrow.released_amount = escrow.released_amount + amount;
  }

  /// Refund remaining escrow to buyer (for cancelled/failed jobs)
  public entry fun refund_escrow(
    buyer: &signer,
    job_id: u64,
  ) acquires EscrowStore {
    let buyer_addr = signer::address_of(buyer);
    
    let escrow_store = borrow_global_mut<EscrowStore>(buyer_addr);
    assert!(table::contains(&escrow_store.escrows, job_id), E_ESCROW_NOT_FOUND);
    
    let escrow = table::borrow_mut(&mut escrow_store.escrows, job_id);
    
    // Calculate refund amount
    let refund_amount = escrow.total_amount - escrow.released_amount;
    
    // Extract remaining coins from escrow
    if (refund_amount > 0) {
      let refund_coins = coin::extract(&mut escrow.coins, refund_amount);
      
      // Deposit back to buyer
      coin::deposit(escrow.buyer_address, refund_coins);
    };
    
    // Mark escrow as inactive
    escrow.is_active = false;
  }

  /// Close escrow and return any remaining funds (after job completion)
  public entry fun close_escrow(
    buyer: &signer,
    job_id: u64,
  ) acquires EscrowStore {
    let buyer_addr = signer::address_of(buyer);
    
    let escrow_store = borrow_global_mut<EscrowStore>(buyer_addr);
    assert!(table::contains(&escrow_store.escrows, job_id), E_ESCROW_NOT_FOUND);
    
    // Remove escrow from table
    let EscrowAccount {
      job_id: _,
      buyer_address,
      provider_address: _,
      total_amount: _,
      released_amount: _,
      is_active: _,
      coins,
    } = table::remove(&mut escrow_store.escrows, job_id);
    
    // Return any remaining coins to buyer
    let remaining_value = coin::value(&coins);
    if (remaining_value > 0) {
      coin::deposit(buyer_address, coins);
    } else {
      coin::destroy_zero(coins);
    };
  }

  // View functions
  #[view]
  public fun get_escrow(buyer_address: address, job_id: u64): (u64, address, u64, u64, bool) acquires EscrowStore {
    assert!(exists<EscrowStore>(buyer_address), E_ESCROW_NOT_FOUND);
    let escrow_store = borrow_global<EscrowStore>(buyer_address);
    assert!(table::contains(&escrow_store.escrows, job_id), E_ESCROW_NOT_FOUND);
    
    let escrow = table::borrow(&escrow_store.escrows, job_id);
    (
      escrow.job_id,
      escrow.provider_address,
      escrow.total_amount,
      escrow.released_amount,
      escrow.is_active,
    )
  }

  #[view]
  public fun get_remaining_balance(buyer_address: address, job_id: u64): u64 acquires EscrowStore {
    assert!(exists<EscrowStore>(buyer_address), E_ESCROW_NOT_FOUND);
    let escrow_store = borrow_global<EscrowStore>(buyer_address);
    assert!(table::contains(&escrow_store.escrows, job_id), E_ESCROW_NOT_FOUND);
    
    let escrow = table::borrow(&escrow_store.escrows, job_id);
    coin::value(&escrow.coins)
  }

  #[view]
  public fun is_escrow_active(buyer_address: address, job_id: u64): bool acquires EscrowStore {
    if (!exists<EscrowStore>(buyer_address)) {
      return false
    };
    
    let escrow_store = borrow_global<EscrowStore>(buyer_address);
    if (!table::contains(&escrow_store.escrows, job_id)) {
      return false
    };
    
    let escrow = table::borrow(&escrow_store.escrows, job_id);
    escrow.is_active
  }

  #[view]
  public fun get_released_amount(buyer_address: address, job_id: u64): u64 acquires EscrowStore {
    assert!(exists<EscrowStore>(buyer_address), E_ESCROW_NOT_FOUND);
    let escrow_store = borrow_global<EscrowStore>(buyer_address);
    assert!(table::contains(&escrow_store.escrows, job_id), E_ESCROW_NOT_FOUND);
    
    let escrow = table::borrow(&escrow_store.escrows, job_id);
    escrow.released_amount
  }
}