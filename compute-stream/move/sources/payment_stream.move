module computestream::payment_stream {
  use std::signer;
  use computestream::escrow;
  use aptos_framework::table::{Self, Table};

  /// Error codes
  const E_STREAM_NOT_FOUND: u64 = 1;
  const E_NOT_AUTHORIZED: u64 = 2;
  const E_STREAM_ALREADY_EXISTS: u64 = 3;
  const E_STREAM_NOT_ACTIVE: u64 = 4;
  const E_INVALID_RATE: u64 = 5;

  /// Payment stream for continuous micropayments
  struct Stream has store, drop {
    job_id: u64,
    payer_address: address,
    payee_address: address,
    rate_per_second: u64,
    start_time: u64,
    last_claimed_time: u64,
    total_streamed: u64,
    is_active: bool,
  }

  /// Container for storing multiple streams per payer
  struct StreamStore has key {
    streams: Table<u64, Stream>,
  }

  /// Open a new payment stream
  public entry fun open_stream(
    payer: &signer,
    job_id: u64,
    payee_address: address,
    rate_per_second: u64,
    start_time: u64,
  ) acquires StreamStore {
    let payer_addr = signer::address_of(payer);
    
    // Validate rate
    assert!(rate_per_second > 0, E_INVALID_RATE);
    
    // Initialize stream store if it doesn't exist
    if (!exists<StreamStore>(payer_addr)) {
      move_to(payer, StreamStore {
        streams: table::new(),
      });
    };
    
    // Get stream store
    let stream_store = borrow_global_mut<StreamStore>(payer_addr);
    
    // Check if stream already exists for this job
    assert!(!table::contains(&stream_store.streams, job_id), E_STREAM_ALREADY_EXISTS);
    
    // Create stream
    let stream = Stream {
      job_id,
      payer_address: payer_addr,
      payee_address,
      rate_per_second,
      start_time,
      last_claimed_time: start_time,
      total_streamed: 0,
      is_active: true,
    };
    
    // Store stream in table
    table::add(&mut stream_store.streams, job_id, stream);
  }

  /// Process payment (called every second by x402 protocol)
  /// This actually transfers coins from escrow to provider
  public entry fun process_payment(
    payer: &signer,
    job_id: u64,
    current_time: u64,
  ) acquires StreamStore {
    let payer_addr = signer::address_of(payer);
    
    let stream_store = borrow_global_mut<StreamStore>(payer_addr);
    assert!(table::contains(&stream_store.streams, job_id), E_STREAM_NOT_FOUND);
    
    let stream = table::borrow_mut(&mut stream_store.streams, job_id);
    
    // Verify stream is active
    assert!(stream.is_active, E_STREAM_NOT_ACTIVE);
    
    // Calculate payment amount based on elapsed time
    let elapsed_seconds = current_time - stream.last_claimed_time;
    
    if (elapsed_seconds > 0) {
      let payment_amount = stream.rate_per_second * elapsed_seconds;
      
      // Update stream state
      stream.last_claimed_time = current_time;
      stream.total_streamed = stream.total_streamed + payment_amount;
      
      // Actually release payment from escrow to provider
      escrow::release_payment(payer, job_id, payment_amount);
    };
  }

  /// Close stream (when job completes or fails)
  public entry fun close_stream(
    payer: &signer,
    job_id: u64,
    final_time: u64,
  ) acquires StreamStore {
    let payer_addr = signer::address_of(payer);
    
    let stream_store = borrow_global_mut<StreamStore>(payer_addr);
    assert!(table::contains(&stream_store.streams, job_id), E_STREAM_NOT_FOUND);
    
    let stream = table::borrow_mut(&mut stream_store.streams, job_id);
    
    // Process final payment
    if (stream.is_active && final_time > stream.last_claimed_time) {
      let elapsed_seconds = final_time - stream.last_claimed_time;
      let final_payment = stream.rate_per_second * elapsed_seconds;
      stream.total_streamed = stream.total_streamed + final_payment;
      stream.last_claimed_time = final_time;
      
      // Release final payment
      escrow::release_payment(payer, job_id, final_payment);
    };
    
    // Mark stream as inactive
    stream.is_active = false;
  }

  /// Pause stream (emergency stop)
  public entry fun pause_stream(
    payer: &signer,
    job_id: u64,
    pause_time: u64,
  ) acquires StreamStore {
    let payer_addr = signer::address_of(payer);
    
    let stream_store = borrow_global_mut<StreamStore>(payer_addr);
    assert!(table::contains(&stream_store.streams, job_id), E_STREAM_NOT_FOUND);
    
    let stream = table::borrow_mut(&mut stream_store.streams, job_id);
    
    // Process payment up to pause time
    if (stream.is_active && pause_time > stream.last_claimed_time) {
      let elapsed_seconds = pause_time - stream.last_claimed_time;
      let payment_amount = stream.rate_per_second * elapsed_seconds;
      stream.total_streamed = stream.total_streamed + payment_amount;
      stream.last_claimed_time = pause_time;
      
      // Release payment before pausing
      escrow::release_payment(payer, job_id, payment_amount);
    };
    
    stream.is_active = false;
  }

  /// Resume stream
  public entry fun resume_stream(
    payer: &signer,
    job_id: u64,
    resume_time: u64,
  ) acquires StreamStore {
    let payer_addr = signer::address_of(payer);
    
    let stream_store = borrow_global_mut<StreamStore>(payer_addr);
    assert!(table::contains(&stream_store.streams, job_id), E_STREAM_NOT_FOUND);
    
    let stream = table::borrow_mut(&mut stream_store.streams, job_id);
    
    stream.is_active = true;
    stream.last_claimed_time = resume_time;
  }

  // View functions
  #[view]
  public fun get_stream(payer_address: address, job_id: u64): (u64, address, u64, u64, u64, bool) acquires StreamStore {
    assert!(exists<StreamStore>(payer_address), E_STREAM_NOT_FOUND);
    let stream_store = borrow_global<StreamStore>(payer_address);
    assert!(table::contains(&stream_store.streams, job_id), E_STREAM_NOT_FOUND);
    
    let stream = table::borrow(&stream_store.streams, job_id);
    (
      stream.job_id,
      stream.payee_address,
      stream.rate_per_second,
      stream.start_time,
      stream.total_streamed,
      stream.is_active,
    )
  }

  #[view]
  public fun get_total_streamed(payer_address: address, job_id: u64): u64 acquires StreamStore {
    assert!(exists<StreamStore>(payer_address), E_STREAM_NOT_FOUND);
    let stream_store = borrow_global<StreamStore>(payer_address);
    assert!(table::contains(&stream_store.streams, job_id), E_STREAM_NOT_FOUND);
    
    let stream = table::borrow(&stream_store.streams, job_id);
    stream.total_streamed
  }

  #[view]
  public fun calculate_current_amount(payer_address: address, job_id: u64, current_time: u64): u64 acquires StreamStore {
    assert!(exists<StreamStore>(payer_address), E_STREAM_NOT_FOUND);
    let stream_store = borrow_global<StreamStore>(payer_address);
    assert!(table::contains(&stream_store.streams, job_id), E_STREAM_NOT_FOUND);
    
    let stream = table::borrow(&stream_store.streams, job_id);
    
    if (!stream.is_active) {
      return stream.total_streamed
    };
    
    let elapsed_seconds = current_time - stream.last_claimed_time;
    let pending_amount = stream.rate_per_second * elapsed_seconds;
    stream.total_streamed + pending_amount
  }

  #[view]
  public fun is_stream_active(payer_address: address, job_id: u64): bool acquires StreamStore {
    if (!exists<StreamStore>(payer_address)) {
      return false
    };
    
    let stream_store = borrow_global<StreamStore>(payer_address);
    if (!table::contains(&stream_store.streams, job_id)) {
      return false
    };
    
    let stream = table::borrow(&stream_store.streams, job_id);
    stream.is_active
  }
}