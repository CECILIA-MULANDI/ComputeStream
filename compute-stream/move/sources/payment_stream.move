module computestream::payment_stream {
  use std::signer;
  use computestream::escrow;

  /// Error codes
  const E_STREAM_NOT_FOUND: u64 = 1;
  const E_NOT_AUTHORIZED: u64 = 2;
  const E_STREAM_ALREADY_EXISTS: u64 = 3;
  const E_STREAM_NOT_ACTIVE: u64 = 4;
  const E_INVALID_RATE: u64 = 5;

  /// Payment stream for continuous micropayments
  struct Stream has key, store, drop {
    job_id: u64,
    payer_address: address,
    payee_address: address,
    rate_per_second: u64,
    start_time: u64,
    last_claimed_time: u64,
    total_streamed: u64,
    is_active: bool,
  }

  /// Open a new payment stream
  public entry fun open_stream(
    payer: &signer,
    job_id: u64,
    payee_address: address,
    rate_per_second: u64,
    start_time: u64,
  ) {
    let payer_addr = signer::address_of(payer);
    
    // Validate rate
    assert!(rate_per_second > 0, E_INVALID_RATE);
    
    // Check if stream already exists
    assert!(!exists<Stream>(payer_addr), E_STREAM_ALREADY_EXISTS);
    
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
    
    move_to(payer, stream);
  }

  /// Process payment (called every second by x402 protocol)
  /// This actually transfers coins from escrow to provider
  public entry fun process_payment(
    payer: &signer,
    current_time: u64,
  ) acquires Stream {
    let payer_addr = signer::address_of(payer);
    
    let stream = borrow_global_mut<Stream>(payer_addr);
    
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
      escrow::release_payment(payer, payment_amount);
    };
  }

  /// Close stream (when job completes or fails)
  public entry fun close_stream(
    payer: &signer,
    final_time: u64,
  ) acquires Stream {
    let payer_addr = signer::address_of(payer);
    
    let stream = borrow_global_mut<Stream>(payer_addr);
    
    // Process final payment
    if (stream.is_active && final_time > stream.last_claimed_time) {
      let elapsed_seconds = final_time - stream.last_claimed_time;
      let final_payment = stream.rate_per_second * elapsed_seconds;
      stream.total_streamed = stream.total_streamed + final_payment;
      stream.last_claimed_time = final_time;
      
      // Release final payment
      escrow::release_payment(payer, final_payment);
    };
    
    // Mark stream as inactive
    stream.is_active = false;
  }

  /// Pause stream (emergency stop)
  public entry fun pause_stream(
    payer: &signer,
    pause_time: u64,
  ) acquires Stream {
    let payer_addr = signer::address_of(payer);
    
    let stream = borrow_global_mut<Stream>(payer_addr);
    
    // Process payment up to pause time
    if (stream.is_active && pause_time > stream.last_claimed_time) {
      let elapsed_seconds = pause_time - stream.last_claimed_time;
      let payment_amount = stream.rate_per_second * elapsed_seconds;
      stream.total_streamed = stream.total_streamed + payment_amount;
      stream.last_claimed_time = pause_time;
      
      // Release payment before pausing
      escrow::release_payment(payer, payment_amount);
    };
    
    stream.is_active = false;
  }

  /// Resume stream
  public entry fun resume_stream(
    payer: &signer,
    resume_time: u64,
  ) acquires Stream {
    let payer_addr = signer::address_of(payer);
    
    let stream = borrow_global_mut<Stream>(payer_addr);
    
    stream.is_active = true;
    stream.last_claimed_time = resume_time;
  }

  // View functions
  #[view]
  public fun get_stream(payer_address: address): (u64, address, u64, u64, u64, bool) acquires Stream {
    let stream = borrow_global<Stream>(payer_address);
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
  public fun get_total_streamed(payer_address: address): u64 acquires Stream {
    let stream = borrow_global<Stream>(payer_address);
    stream.total_streamed
  }

  #[view]
  public fun calculate_current_amount(payer_address: address, current_time: u64): u64 acquires Stream {
    let stream = borrow_global<Stream>(payer_address);
    
    if (!stream.is_active) {
      return stream.total_streamed
    };
    
    let elapsed_seconds = current_time - stream.last_claimed_time;
    let pending_amount = stream.rate_per_second * elapsed_seconds;
    stream.total_streamed + pending_amount
  }

  #[view]
  public fun is_stream_active(payer_address: address): bool acquires Stream {
    if (!exists<Stream>(payer_address)) {
      return false
    };
    
    let stream = borrow_global<Stream>(payer_address);
    stream.is_active
  }
}